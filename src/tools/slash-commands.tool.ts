import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeOpenCodeCLI } from '../utils/opencodeExecutor.js';
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES
} from '../constants.js';

// Shared schema for slash commands
const slashCommandArgsSchema = z.object({
  prompt: z.string().min(1).describe("Analysis request. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions"),
  model: z.string().optional().describe("Optional model to use (e.g., 'google/gemini-2.5-flash'). If not specified, uses the primary model configured at server startup."),
});

// Shared execution logic
async function executeSlashCommand(
  args: any,
  agent: string,
  onProgress?: (newOutput: string) => void
): Promise<string> {
  const { prompt, model } = args;

  if (!prompt?.trim()) {
    throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
  }

  const result = await executeOpenCodeCLI(
    prompt as string,
    agent,
    model as string | undefined,
    onProgress
  );

  return `${STATUS_MESSAGES.OPENCODE_RESPONSE}\n${result}`;
}

export const opencodePlanTool: UnifiedTool = {
  name: "plan",
  description: "Execute OpenCode in plan mode for structured analysis and planning",
  zodSchema: slashCommandArgsSchema,
  prompt: {
    description: "Execute 'opencode run <prompt> --agent plan' for structured planning and analysis.",
  },
  category: 'opencode',
  execute: async (args, onProgress) => {
    return executeSlashCommand(args, "plan", onProgress);
  }
};

export const opencodeBuildTool: UnifiedTool = {
  name: "build",
  description: "Execute OpenCode in immediate execution mode for direct implementation",
  zodSchema: slashCommandArgsSchema,
  prompt: {
    description: "Execute 'opencode run <prompt>' for immediate code execution and implementation.",
  },
  category: 'opencode',
  execute: async (args, onProgress) => {
    return executeSlashCommand(args, "build", onProgress);
  }
};