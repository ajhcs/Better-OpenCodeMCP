import { executeCommand } from './commandExecutor.js';
import { Logger } from './logger.js';
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  CLI
} from '../constants.js';
import { getServerConfig } from '../config.js';

export async function executeOpenCodeCLI(
  prompt: string,
  agent: string,
  model?: string,
  onProgress?: (newOutput: string) => void
): Promise<string> {
  const serverConfig = getServerConfig();

  const args: string[] = [CLI.SUBCOMMANDS.RUN];

  // Use model from parameter or server config
  const useModel = model || serverConfig.primaryModel;
  args.push(CLI.FLAGS.MODEL, useModel);

  // Add agent (now required)
  args.push(CLI.FLAGS.AGENT, agent);

  // Add prompt as positional argument (no -p flag in opencode)
  args.push(prompt);

  try {
    return await executeCommand(CLI.COMMANDS.OPENCODE, args, onProgress);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.toLowerCase().includes(ERROR_MESSAGES.QUOTA_EXCEEDED) && serverConfig.fallbackModel) {
      Logger.warn(`${ERROR_MESSAGES.QUOTA_EXCEEDED_SHORT} Trying fallback model: ${serverConfig.fallbackModel}`);
      await sendStatusMessage(STATUS_MESSAGES.FALLBACK_RETRY);

      const fallbackArgs: string[] = [CLI.SUBCOMMANDS.RUN];
      fallbackArgs.push(CLI.FLAGS.MODEL, serverConfig.fallbackModel);
      fallbackArgs.push(CLI.FLAGS.AGENT, agent);

      fallbackArgs.push(prompt);

      try {
        const result = await executeCommand(CLI.COMMANDS.OPENCODE, fallbackArgs, onProgress);
        Logger.warn(`Successfully executed with fallback model: ${serverConfig.fallbackModel}`);
        await sendStatusMessage(STATUS_MESSAGES.FALLBACK_SUCCESS);
        return result;
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`Primary model failed, fallback model also failed: ${fallbackErrorMessage}`);
      }
    } else {
      throw error;
    }
  }
}

// Placeholder
async function sendStatusMessage(message: string): Promise<void> {
  Logger.debug(`Status: ${message}`);
}