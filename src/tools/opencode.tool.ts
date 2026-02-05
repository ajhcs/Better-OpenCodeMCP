/**
 * Async OpenCode Tool - Delegates tasks to OpenCode for autonomous execution.
 * Returns immediately with a taskId, processes events in background.
 * @module opencode.tool
 */

import { z } from "zod";
import { spawn, ChildProcess } from "node:child_process";
import { UnifiedTool } from "./registry.js";
import { TaskManager } from "../tasks/taskManager.js";
import { parseOpenCodeEvent, OpenCodeEvent } from "../utils/jsonEventParser.js";
import { getServerConfig } from "../config.js";
import { Logger } from "../utils/logger.js";
import { CLI } from "../constants.js";

// ============================================================================
// Schema
// ============================================================================

const opencodeArgsSchema = z.object({
  task: z
    .string()
    .min(1)
    .describe("The task/prompt to send to OpenCode for autonomous execution"),
  agent: z
    .enum(["explore", "plan", "build"])
    .optional()
    .describe("OpenCode agent mode: 'explore' for investigation, 'plan' for structured analysis, 'build' for immediate execution"),
  outputGuidance: z
    .string()
    .optional()
    .describe("Instructions for how OpenCode should format its output"),
  model: z
    .string()
    .optional()
    .describe("Override default model (e.g., 'google/gemini-2.5-pro')"),
  sessionTitle: z
    .string()
    .optional()
    .describe("Human-readable session name for tracking"),
});

// ============================================================================
// Types
// ============================================================================

export interface OpenCodeToolArgs {
  task: string;
  agent?: "explore" | "plan" | "build";
  outputGuidance?: string;
  model?: string;
  sessionTitle?: string;
}

export interface OpenCodeToolResult {
  taskId: string;
  sessionId: string;
  status: "working";
}

// ============================================================================
// Singleton TaskManager
// ============================================================================

let taskManagerInstance: TaskManager | null = null;

/**
 * Gets the singleton TaskManager instance.
 * Creates it if it doesn't exist.
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager((taskId, status, statusMessage) => {
      Logger.debug(`Task ${taskId} status changed to: ${status}${statusMessage ? ` - ${statusMessage}` : ""}`);
    });
  }
  return taskManagerInstance;
}

/**
 * Sets a custom TaskManager instance (primarily for testing).
 */
export function setTaskManager(manager: TaskManager | null): void {
  taskManagerInstance = manager;
}

// ============================================================================
// Process Management
// ============================================================================

/** Map of taskId to spawned process for cleanup */
const activeProcesses = new Map<string, ChildProcess>();

/**
 * Spawns OpenCode process with JSON format and processes events.
 */
function spawnOpenCodeProcess(
  taskId: string,
  task: string,
  model: string,
  agent?: string,
  outputGuidance?: string
): void {
  const taskManager = getTaskManager();

  // Build command arguments
  const args: string[] = [
    CLI.FLAGS.MODEL, model,
    "--format", "json",
  ];

  if (agent) {
    args.push(CLI.FLAGS.AGENT, agent);
  }

  // Combine task with output guidance if provided
  const fullPrompt = outputGuidance
    ? `${task}\n\nOutput guidance: ${outputGuidance}`
    : task;
  args.push(fullPrompt);

  Logger.debug(`Spawning OpenCode: ${CLI.COMMANDS.OPENCODE} ${args.map(a => `"${a}"`).join(" ")}`);

  // Spawn the process
  const proc = spawn(CLI.COMMANDS.OPENCODE, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  activeProcesses.set(taskId, proc);

  // Buffer for incomplete lines
  let buffer = "";

  // Process stdout as NDJSON stream
  proc.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        const event = parseOpenCodeEvent(line);
        if (event) {
          processEvent(taskId, event);
        }
      }
    }
  });

  // Log stderr but don't fail on it (OpenCode may write progress there)
  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    Logger.debug(`OpenCode stderr [${taskId}]: ${text}`);
  });

  // Handle process errors
  proc.on("error", (error: Error) => {
    Logger.error(`OpenCode process error [${taskId}]:`, error);
    taskManager.failTask(taskId, `Process error: ${error.message}`);
    activeProcesses.delete(taskId);
  });

  // Handle process exit
  proc.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
    Logger.debug(`OpenCode process closed [${taskId}]: code=${code}, signal=${signal}`);

    // Process any remaining buffer content
    if (buffer.trim()) {
      const event = parseOpenCodeEvent(buffer);
      if (event) {
        processEvent(taskId, event);
      }
    }

    // Check if task needs to be marked as failed
    const status = taskManager.getTaskStatus(taskId);
    if (status === "working") {
      if (code !== null && code !== 0) {
        taskManager.failTask(taskId, `Process exited with code ${code}`);
      } else if (signal) {
        taskManager.failTask(taskId, `Process killed by signal ${signal}`);
      }
      // If code is 0 but status is still working, the step_finish event should have handled completion
      // This is a fallback for edge cases
    }

    activeProcesses.delete(taskId);
  });
}

/**
 * Processes a single OpenCode event.
 */
function processEvent(taskId: string, event: OpenCodeEvent): void {
  const taskManager = getTaskManager();

  try {
    taskManager.handleEvent(taskId, event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error(`Failed to process event for task ${taskId}:`, message);
  }
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const opencodeTool: UnifiedTool = {
  name: "opencode",
  description: `Delegate a task to OpenCode for autonomous execution. Returns immediately with a taskId while the task runs in background.

USE THIS TOOL when you need to:
- Run code analysis, generation, or modification tasks
- Delegate work to another model for parallel processing
- Execute long-running operations asynchronously

WORKFLOW:
1. Call opencode with task description and optional agent mode
2. Receive taskId immediately (status: "working")
3. Monitor progress with opencode_sessions tool
4. If status becomes "input_required", use opencode_respond to provide input
5. Task completes with status "completed" or "failed"

INPUTS:
- task (required): What you want OpenCode to do
- agent: "explore" (investigation), "plan" (structured analysis), "build" (immediate execution)
- model: Override the default model (e.g., 'google/gemini-2.5-pro')
- outputGuidance: Instructions for how OpenCode should format its output
- sessionTitle: Human-readable name for tracking

RETURNS: { taskId, sessionId, status: "working" }

NOTE: This is an async operation. The task continues running after this tool returns. Use opencode_sessions to check completion status.`,
  zodSchema: opencodeArgsSchema,
  category: "opencode",

  execute: async (args): Promise<string> => {
    const taskManager = getTaskManager();
    const config = getServerConfig();

    // Extract and validate arguments
    const task = args.task as string | undefined;
    const agent = args.agent as "explore" | "plan" | "build" | undefined;
    const outputGuidance = args.outputGuidance as string | undefined;
    const model = args.model as string | undefined;
    const sessionTitle = args.sessionTitle as string | undefined;

    if (!task?.trim()) {
      throw new Error("Task is required and cannot be empty");
    }

    // Determine model to use
    const effectiveModel = model || config.primaryModel;

    // Generate session title if not provided
    const title = sessionTitle || `OpenCode task: ${task.slice(0, 50)}${task.length > 50 ? "..." : ""}`;

    // Create the task
    const taskId = await taskManager.createTask({
      title,
      model: effectiveModel,
      agent,
    });

    Logger.debug(`Created task ${taskId}: ${title}`);

    // Spawn the OpenCode process (runs in background)
    spawnOpenCodeProcess(taskId, task, effectiveModel, agent, outputGuidance);

    // Get metadata for response (sessionId will be "" until first event)
    const metadata = taskManager.getTaskMetadata(taskId);

    // Build result object
    const result: OpenCodeToolResult = {
      taskId,
      sessionId: metadata?.sessionId || "",
      status: "working",
    };

    // Return immediately as JSON
    return JSON.stringify(result, null, 2);
  },
};

// ============================================================================
// Cleanup Utilities
// ============================================================================

/**
 * Kills all active OpenCode processes.
 * Call this during server shutdown.
 */
export function cleanupActiveProcesses(): void {
  for (const [taskId, proc] of activeProcesses) {
    Logger.debug(`Killing process for task ${taskId}`);
    proc.kill("SIGTERM");
  }
  activeProcesses.clear();
}

/**
 * Gets the number of active processes.
 */
export function getActiveProcessCount(): number {
  return activeProcesses.size;
}
