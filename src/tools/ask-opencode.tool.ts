import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeOpenCodeCLI } from '../utils/opencodeExecutor.js';
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES
} from '../constants.js';

const askOpenCodeArgsSchema = z.object({
  prompt: z.string().min(1).describe("Analysis request. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions"),
  model: z.string().optional().describe("Optional model to use (e.g., 'google/gemini-2.5-flash'). If not specified, uses the primary model configured at server startup."),
  agent: z.string().default("plan").describe("Execution agent: 'plan' for structured analysis, 'build' for immediate execution, or custom agent string"),
});

export const askOpenCodeTool: UnifiedTool = {
  name: "ask-opencode",
  description: "Execute OpenCode with model selection [-m] and agent selection [--agent]",
  zodSchema: askOpenCodeArgsSchema,
  prompt: {
    description: "Execute 'opencode run <prompt>' to get OpenCode AI's response. Supports plan mode (default) and other execution modes.",
  },
  category: 'opencode',
  execute: async (args, onProgress) => {
    const { prompt, model, agent } = args;
    if (!prompt?.trim()) {
      throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
    }

    const result = await executeOpenCodeCLI(
      prompt as string,
      agent as string,
      model as string | undefined,
      onProgress
    );

    return `${STATUS_MESSAGES.OPENCODE_RESPONSE}\n${result}`;
  }
};
