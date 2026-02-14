/**
 * OpenCode Respond Tool - Send responses to tasks waiting for input.
 * Continues an existing OpenCode session when task is in `input_required` state.
 * @module opencode-respond.tool
 */

import { z } from "zod";
import { spawn, ChildProcess } from "node:child_process";
import { UnifiedTool } from "./registry.js";
import { getTaskManager } from "../tasks/sharedTaskManager.js";
import { parseOpenCodeEvent, OpenCodeEvent } from "../utils/jsonEventParser.js";
import { Logger } from "../utils/logger.js";
import { CLI, LIMITS, PROCESS } from "../constants.js";
import { killProcess } from "../utils/processKill.js";
import { getPersistence } from "../persistence/sharedPersistence.js";
import { TaskStatus } from "../tasks/taskManager.js";

// ============================================================================
// Schema
// ============================================================================

const opencodeRespondArgsSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe("The task ID to respond to (must be in input_required state)"),
  response: z
    .string()
    .min(1)
    .max(LIMITS.MAX_RESPONSE_LENGTH)
    .describe("The response text to send to the OpenCode session"),
});

// ============================================================================
// Types
// ============================================================================

export interface OpenCodeRespondArgs {
  taskId: string;
  response: string;
}

export interface OpenCodeRespondResult {
  taskId: string;
  status: TaskStatus;
  message: string;
}

// ============================================================================
// Process Management
// ============================================================================

/** Map of taskId to spawned process for respond operations */
const activeRespondProcesses = new Map<string, ChildProcess>();

/** Map of taskId to timeout handle for respond process runtime limits */
const respondTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Spawns OpenCode process with session continuation and processes events.
 */
function spawnOpenCodeRespondProcess(
  taskId: string,
  sessionId: string,
  response: string
): void {
  const taskManager = getTaskManager();

  // Build command arguments for session continuation - must use 'run' subcommand
  const args: string[] = [
    CLI.SUBCOMMANDS.RUN,
    "--session", sessionId,
    "--format", "json",
    response,
  ];

  Logger.debug(`Spawning OpenCode respond: ${CLI.COMMANDS.OPENCODE} ${args.map(a => `"${a}"`).join(" ")}`);

  // Spawn the process
  const proc = spawn(CLI.COMMANDS.OPENCODE, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  activeRespondProcesses.set(taskId, proc);

  // Set process timeout
  const timeout = setTimeout(() => {
    Logger.warn(`Respond process timeout for task ${taskId} after ${PROCESS.MAX_RUNTIME_MS / 1000}s`);
    killProcess(proc);
    taskManager.failTask(taskId, `Respond process timed out after ${PROCESS.MAX_RUNTIME_MS / 1000} seconds`);
    activeRespondProcesses.delete(taskId);
    respondTimeouts.delete(taskId);
  }, PROCESS.MAX_RUNTIME_MS);
  respondTimeouts.set(taskId, timeout);

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
          processRespondEvent(taskId, event);
        }
      }
    }
  });

  // Log stderr but don't fail on it (OpenCode may write progress there)
  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    Logger.debug(`OpenCode respond stderr [${taskId}]: ${text}`);
  });

  // Handle process errors
  proc.on("error", (error: Error) => {
    Logger.error(`OpenCode respond process error [${taskId}]:`, error);
    const t = respondTimeouts.get(taskId);
    if (t) clearTimeout(t);
    respondTimeouts.delete(taskId);
    taskManager.failTask(taskId, `Respond process error: ${error.message}`);
    activeRespondProcesses.delete(taskId);
  });

  // Handle process exit
  proc.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
    Logger.debug(`OpenCode respond process closed [${taskId}]: code=${code}, signal=${signal}`);

    // Clear the timeout
    const t = respondTimeouts.get(taskId);
    if (t) clearTimeout(t);
    respondTimeouts.delete(taskId);

    // Process any remaining buffer content
    if (buffer.trim()) {
      const event = parseOpenCodeEvent(buffer);
      if (event) {
        processRespondEvent(taskId, event);
      }
    }

    // Check if task needs to be marked as failed
    const status = taskManager.getTaskStatus(taskId);
    if (status === "working") {
      if (code !== null && code !== 0) {
        taskManager.failTask(taskId, `Respond process exited with code ${code}`);
      } else if (signal) {
        taskManager.failTask(taskId, `Respond process killed by signal ${signal}`);
      }
    }

    activeRespondProcesses.delete(taskId);
  });
}

/**
 * Processes a single OpenCode event for a respond operation.
 */
function processRespondEvent(taskId: string, event: OpenCodeEvent): void {
  const taskManager = getTaskManager();

  try {
    taskManager.handleEvent(taskId, event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error(`Failed to process respond event for task ${taskId}:`, message);
  }

  // Fire-and-forget event persistence
  const persistence = getPersistence();
  if (persistence) {
    persistence.appendEvent(taskId, event).catch((err) => {
      Logger.debug(`Failed to persist respond event: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const opencodeRespondTool: UnifiedTool = {
  name: "opencode_respond",
  description: `Send a response to an OpenCode task that is waiting for user input. Resumes task execution after providing the requested information.

USE THIS TOOL when:
- opencode_sessions shows a task with status "input_required"
- OpenCode needs clarification, confirmation, or additional information to proceed
- You want to answer a question posed by a running task

PREREQUISITES:
- Valid taskId from a previously started opencode task
- Task must be in "input_required" state (check with opencode_sessions)
- Task must have a valid sessionId (automatically assigned during task creation)

WORKFLOW:
1. Check opencode_sessions to find tasks needing input
2. Review what input is being requested (from task status message)
3. Call opencode_respond with taskId and your response
4. Task resumes execution (status returns to "working")
5. Continue monitoring with opencode_sessions

INPUTS:
- taskId (required): The task ID to respond to
- response (required): The response text to send to the OpenCode session

RETURNS: { taskId, status: "working", message: "Response sent..." }

ERROR CONDITIONS:
- Task not found: Invalid taskId
- Wrong status: Task is not in "input_required" state
- No session: Task lacks sessionId (internal error)`,
  zodSchema: opencodeRespondArgsSchema,
  category: "opencode",

  execute: async (args): Promise<string> => {
    const taskManager = getTaskManager();

    // Extract and validate arguments
    const taskId = args.taskId as string | undefined;
    const response = args.response as string | undefined;

    if (!taskId?.trim()) {
      throw new Error("taskId is required and cannot be empty");
    }

    if (!response?.trim()) {
      throw new Error("response is required and cannot be empty");
    }

    // Get current task state
    const taskState = taskManager.getTaskState(taskId);

    if (!taskState) {
      const errorResult: OpenCodeRespondResult = {
        taskId,
        status: "failed" as TaskStatus,
        message: `Task not found: ${taskId}`,
      };
      return JSON.stringify(errorResult, null, 2);
    }

    // Validate task is in input_required state
    if (taskState.status !== "input_required") {
      const errorResult: OpenCodeRespondResult = {
        taskId,
        status: taskState.status,
        message: `Task is not waiting for input. Current status: ${taskState.status}. Only tasks in 'input_required' state can receive responses.`,
      };
      return JSON.stringify(errorResult, null, 2);
    }

    // Validate sessionId exists
    const sessionId = taskState.metadata.sessionId;
    if (!sessionId) {
      const errorResult: OpenCodeRespondResult = {
        taskId,
        status: taskState.status,
        message: "Task has no session ID. Cannot continue session without a valid sessionId.",
      };
      return JSON.stringify(errorResult, null, 2);
    }

    Logger.debug(`Sending response to task ${taskId} in session ${sessionId}`);

    // Spawn the OpenCode respond process (runs in background)
    spawnOpenCodeRespondProcess(taskId, sessionId, response);

    // Build result object - status transitions to working after response is sent
    const result: OpenCodeRespondResult = {
      taskId,
      status: "working",
      message: `Response sent to task. Session ${sessionId} is continuing.`,
    };

    // Return immediately as JSON
    return JSON.stringify(result, null, 2);
  },
};

// ============================================================================
// Cleanup Utilities
// ============================================================================

/**
 * Kills all active OpenCode respond processes.
 * Call this during server shutdown.
 */
export function cleanupActiveRespondProcesses(): void {
  for (const [taskId, proc] of activeRespondProcesses) {
    Logger.debug(`Killing respond process for task ${taskId}`);
    killProcess(proc);
  }
  activeRespondProcesses.clear();
  for (const t of respondTimeouts.values()) {
    clearTimeout(t);
  }
  respondTimeouts.clear();
}

/**
 * Gets the number of active respond processes.
 */
export function getActiveRespondProcessCount(): number {
  return activeRespondProcesses.size;
}
