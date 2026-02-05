#!/usr/bin/env node

import { Command } from "commander";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CallToolRequest,
  ListToolsRequest,
  ListPromptsRequest,
  GetPromptRequest,
  Tool,
  Prompt,
  GetPromptResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Logger } from "./utils/logger.js";
import { PROTOCOL, ToolArguments } from "./constants.js";
import { setServerConfig } from "./config.js";

import {
  getToolDefinitions,
  getPromptDefinitions,
  executeTool,
  toolExists,
  getPromptMessage
} from "./tools/index.js";

const server = new Server(
  {
    name: "opencode-mcp",
    version: "1.2.0",
  }, {
  capabilities: {
    tools: {},
    prompts: {},
    logging: {},
  },
},
);

// Per-request progress context to support concurrent tool calls
interface ProgressContext {
  operationName: string;
  latestOutput: string;
  interval: NodeJS.Timeout | null;
  progressToken?: string | number;
  messageIndex: number;
  progress: number;
}

// Map of request ID to progress context - enables concurrent requests
const progressContexts = new Map<string, ProgressContext>();

// Generate unique request ID
let requestCounter = 0;
function generateRequestId(): string {
  return `req-${Date.now()}-${++requestCounter}`;
}

async function sendNotification(method: string, params: any) {
  try {
    await server.notification({ method, params });
  } catch (error) {
    Logger.error("notification failed: ", error);
  }
}

/**
 * @param progressToken The progress token provided by the client
 * @param progress The current progress value
 * @param total Optional total value
 * @param message Optional status message
 */
async function sendProgressNotification(
  progressToken: string | number | undefined,
  progress: number,
  total?: number,
  message?: string
) {
  if (!progressToken) return; // Only send if client requested progress

  try {
    const params: any = {
      progressToken,
      progress
    };

    if (total !== undefined) params.total = total; // future cache progress
    if (message) params.message = message;

    await server.notification({
      method: PROTOCOL.NOTIFICATIONS.PROGRESS,
      params
    });
  } catch (error) {
    Logger.error("Failed to send progress notification:", error);
  }
}

function startProgressUpdates(
  operationName: string,
  progressToken?: string | number
): string {
  const requestId = generateRequestId();

  // Create isolated context for this request
  const context: ProgressContext = {
    operationName,
    latestOutput: "",
    interval: null,
    progressToken,
    messageIndex: 0,
    progress: 0,
  };

  progressContexts.set(requestId, context);

  const progressMessages = [
    `🧠 ${operationName} - OpenCode is analyzing your request...`,
    `📊 ${operationName} - Processing files and generating insights...`,
    `✨ ${operationName} - Creating structured response for your review...`,
    `⏱️ ${operationName} - Large analysis in progress (this is normal for big requests)...`,
    `🔍 ${operationName} - Still working... OpenCode takes time for quality results...`,
  ];

  // Send immediate acknowledgment if progress requested
  if (progressToken) {
    sendProgressNotification(
      progressToken,
      0,
      undefined, // No total - indeterminate progress
      `🔍 Starting ${operationName}`
    );
  }

  // Keep client alive with periodic updates
  const progressInterval = setInterval(async () => {
    const ctx = progressContexts.get(requestId);
    if (ctx && ctx.progressToken) {
      ctx.progress += 1;

      // Include latest output if available
      const baseMessage = progressMessages[ctx.messageIndex % progressMessages.length];
      const outputPreview = ctx.latestOutput.slice(-150).trim(); // Last 150 chars
      const message = outputPreview
        ? `${baseMessage}\n📝 Output: ...${outputPreview}`
        : baseMessage;

      await sendProgressNotification(
        ctx.progressToken,
        ctx.progress,
        undefined, // No total - indeterminate progress
        message
      );
      ctx.messageIndex++;
    } else if (!ctx) {
      // Context was removed, clean up interval
      clearInterval(progressInterval);
    }
  }, PROTOCOL.KEEPALIVE_INTERVAL); // Every 25 seconds

  context.interval = progressInterval;
  return requestId;
}

function stopProgressUpdates(requestId: string, success: boolean = true) {
  const context = progressContexts.get(requestId);
  if (!context) return;

  // Clear interval first
  if (context.interval) {
    clearInterval(context.interval);
  }

  // Send final progress notification if client requested progress
  if (context.progressToken) {
    sendProgressNotification(
      context.progressToken,
      100,
      100,
      success ? `✅ ${context.operationName} completed successfully` : `❌ ${context.operationName} failed`
    );
  }

  // Remove context from map
  progressContexts.delete(requestId);
}

// Helper to update output for a specific request
function updateRequestOutput(requestId: string, newOutput: string) {
  const context = progressContexts.get(requestId);
  if (context) {
    context.latestOutput = newOutput;
  }
}

// tools/list
server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest): Promise<{ tools: Tool[] }> => {
  return { tools: getToolDefinitions() as unknown as Tool[] };
});

// tools/call
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
  const toolName: string = request.params.name;

  if (toolExists(toolName)) {
    // Check if client requested progress updates
    const progressToken = (request.params as any)._meta?.progressToken;

    // Start progress updates - returns unique request ID for this call
    const requestId = startProgressUpdates(toolName, progressToken);

    try {
      // Get prompt and other parameters from arguments with proper typing
      const args: ToolArguments = (request.params.arguments as ToolArguments) || {};

      Logger.toolInvocation(toolName, request.params.arguments);

      // Execute the tool using the unified registry with progress callback
      // Each request has its own isolated output state
      const result = await executeTool(toolName, args, (newOutput) => {
        updateRequestOutput(requestId, newOutput);
      });

      // Stop progress updates
      stopProgressUpdates(requestId, true);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
        isError: false,
      };
    } catch (error) {
      // Stop progress updates on error
      stopProgressUpdates(requestId, false);

      Logger.error(`Error in tool '${toolName}':`, error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: "text",
            text: `Error executing ${toolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  } else {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// prompts/list
server.setRequestHandler(ListPromptsRequestSchema, async (request: ListPromptsRequest): Promise<{ prompts: Prompt[] }> => {
  return { prompts: getPromptDefinitions() as unknown as Prompt[] };
});

// prompts/get
server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest): Promise<GetPromptResult> => {
  const promptName = request.params.name;
  const args = request.params.arguments || {};

  const promptMessage = getPromptMessage(promptName, args);

  if (!promptMessage) {
    throw new Error(`Unknown prompt: ${promptName}`);
  }

  return {
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: promptMessage
      }
    }]
  };
});

// Setup CLI arguments and start the server
async function main() {
  const program = new Command();

  program
    .name("opencode-mcp")
    .description("MCP server for OpenCode CLI integration")
    .version("1.2.0")
    .requiredOption("-m, --model <model>", "Primary model to use (e.g., google/gemini-2.5-pro)")
    .option("-f, --fallback-model <model>", "Fallback model for quota/error situations")
    .parse();

  const options = program.opts();

  // Store server configuration globally
  const config = {
    primaryModel: options.model,
    fallbackModel: options.fallbackModel
  };
  setServerConfig(config);

  Logger.debug("init opencode-mcp-tool with model:", config.primaryModel);
  if (config.fallbackModel) {
    Logger.debug("fallback model:", config.fallbackModel);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  Logger.debug("opencode-mcp-tool listening on stdio");
}

main().catch((error) => {
  Logger.error("Fatal error:", error);
  process.exit(1);
}); 
