import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getConfigPath, getConfigDir } from './paths.js';
import { Logger } from '../utils/logger.js';

/**
 * Configuration file structure for opencode-mcp.
 */
export interface McpConfig {
  model?: string;
  fallbackModel?: string;
  defaults?: {
    agent?: 'build' | 'plan' | 'explore';
  };
  pool?: {
    maxConcurrent?: number;
  };
}

/**
 * Load configuration from file.
 * Returns null if file doesn't exist or is invalid.
 */
export function loadConfig(): McpConfig | null {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    Logger.debug(`Config file not found at: ${configPath}`);
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config: McpConfig = JSON.parse(content);
    Logger.debug(`Loaded config from: ${configPath}`);
    return config;
  } catch (error) {
    Logger.warn(`Failed to parse config file, ignoring: ${error}`);
    return null;
  }
}

/**
 * Save configuration to file.
 * Creates the config directory if it doesn't exist.
 */
export function saveConfig(config: McpConfig): void {
  const configPath = getConfigPath();
  const configDir = getConfigDir();

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    Logger.debug(`Created config directory: ${configDir}`);
  }

  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, content, 'utf-8');
  Logger.debug(`Saved config to: ${configPath}`);
}

/**
 * Get a specific config value with type safety.
 */
export function getConfigValue<K extends keyof McpConfig>(
  config: McpConfig | null,
  key: K
): McpConfig[K] | undefined {
  return config?.[key];
}
