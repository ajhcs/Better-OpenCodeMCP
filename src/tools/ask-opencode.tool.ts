import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeOpenCodeCLI, processChangeModeOutput } from '../utils/opencodeExecutor.js';
import { 
  ERROR_MESSAGES, 
  STATUS_MESSAGES
} from '../constants.js';

const askOpenCodeArgsSchema = z.object({
  prompt: z.string().min(1).describe("Analysis request. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions"),
  model: z.string().optional().describe("Optional model to use (e.g., 'google/gemini-2.5-flash'). If not specified, uses the primary model configured at server startup."),
  planMode: z.boolean().default(false).describe("Use plan mode (--mode plan) to generate structured plans before execution, similar to sandbox mode for safer operations"),
  changeMode: z.boolean().default(false).describe("Enable structured change mode - formats prompts to prevent tool errors and returns structured edit suggestions that Claude can apply directly"),
  chunkIndex: z.union([z.number(), z.string()]).optional().describe("Which chunk to return (1-based)"),
  chunkCacheKey: z.string().optional().describe("Optional cache key for continuation"),
});

export const askOpenCodeTool: UnifiedTool = {
  name: "ask-opencode",
  description: "Execute OpenCode with model selection [-m], plan mode [--mode plan], and changeMode for structured edits",
  zodSchema: askOpenCodeArgsSchema,
  prompt: {
    description: "Execute 'opencode run <prompt>' to get OpenCode AI's response. Supports plan mode and enhanced change mode for structured edit suggestions.",
  },
  category: 'opencode',
  execute: async (args, onProgress) => {
    const { prompt, model, planMode, changeMode, chunkIndex, chunkCacheKey } = args; 
    if (!prompt?.trim()) { 
      throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED); 
    }
  
    if (changeMode && chunkIndex && chunkCacheKey) {
      return processChangeModeOutput(
        '', // empty for cache...
        chunkIndex as number,
        chunkCacheKey as string,
        prompt as string
      );
    }
    
    const result = await executeOpenCodeCLI(
      prompt as string,
      model as string | undefined,
      !!planMode,
      !!changeMode,
      onProgress
    );
    
    if (changeMode) {
      return processChangeModeOutput(
        result,
        args.chunkIndex as number | undefined,
        undefined,
        prompt as string
      );
    }
    return `${STATUS_MESSAGES.OPENCODE_RESPONSE}\n${result}`; // changeMode false
  }
};