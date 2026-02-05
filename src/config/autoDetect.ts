import { readFileSync, existsSync } from 'fs';
import { getOpenCodeModelPath } from './paths.js';
import { Logger } from '../utils/logger.js';

/**
 * Structure of OpenCode's model.json file.
 */
interface OpenCodeModelState {
  recent: Array<{
    providerID: string;
    modelID: string;
  }>;
  favorite: Array<{
    providerID: string;
    modelID: string;
  }>;
}

/**
 * Auto-detect the model from OpenCode's state file.
 * Returns the most recently used model in provider/model format.
 * Returns null if detection fails.
 */
export function autoDetectModel(): string | null {
  const modelPath = getOpenCodeModelPath();

  if (!existsSync(modelPath)) {
    Logger.debug(`OpenCode model.json not found at: ${modelPath}`);
    return null;
  }

  try {
    const content = readFileSync(modelPath, 'utf-8');
    const state: OpenCodeModelState = JSON.parse(content);

    if (state.recent && state.recent.length > 0) {
      const recent = state.recent[0];
      const model = `${recent.providerID}/${recent.modelID}`;
      Logger.debug(`Auto-detected model from OpenCode: ${model}`);
      return model;
    }

    // Fallback to first favorite if no recent
    if (state.favorite && state.favorite.length > 0) {
      const favorite = state.favorite[0];
      const model = `${favorite.providerID}/${favorite.modelID}`;
      Logger.debug(`Auto-detected model from favorites: ${model}`);
      return model;
    }

    Logger.debug('OpenCode model.json exists but has no recent or favorite models');
    return null;
  } catch (error) {
    Logger.debug(`Failed to read OpenCode model.json: ${error}`);
    return null;
  }
}

/**
 * Check if OpenCode CLI is available.
 */
export async function isOpenCodeInstalled(): Promise<boolean> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    await execAsync('opencode --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available models from OpenCode CLI.
 * Returns array of model strings in provider/model format.
 */
export async function getAvailableModels(): Promise<string[]> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync('opencode models');
    const models = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.includes('/'));

    return models;
  } catch (error) {
    Logger.debug(`Failed to get models from OpenCode: ${error}`);
    return [];
  }
}
