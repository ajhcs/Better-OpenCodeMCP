/**
 * OpenCode Cancel Tool - Cancel a running task.
 * Kills the associated process and marks the task as cancelled.
 * @module opencode-cancel.tool
 */

import { z } from "zod";
import { UnifiedTool } from "./registry.js";
import { getTaskManager } from "../tasks/sharedTaskManager.js";
import { killTaskProcess } from "./opencode.tool.js";
import { Logger } from "../utils/logger.js";

// ============================================================================
// Schema
// ============================================================================

const opencodeCancelArgsSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe("The task ID to cancel"),
});

// ============================================================================
// Types
// ============================================================================

export interface OpenCodeCancelResult {
  taskId: string;
  status: string;
  message: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const opencodeCancelTool: UnifiedTool = {
  name: "opencode_cancel",
  description: `Cancel a running OpenCode task. Kills the associated process and marks the task as cancelled.

USE THIS TOOL when:
- A task is taking too long and you want to stop it
- You started a task with wrong parameters and want to abort
- You no longer need the result of a running task

PREREQUISITES:
- Valid taskId from a previously started opencode task
- Task must be in a non-terminal state (working or input_required)

INPUTS:
- taskId (required): The task ID to cancel

RETURNS: { taskId, status, message }`,
  zodSchema: opencodeCancelArgsSchema,
  category: "opencode",

  execute: async (args): Promise<string> => {
    const taskManager = getTaskManager();
    const taskId = args.taskId as string | undefined;

    if (!taskId?.trim()) {
      throw new Error("taskId is required and cannot be empty");
    }

    // Check task exists
    const state = taskManager.getTaskState(taskId);
    if (!state) {
      const result: OpenCodeCancelResult = {
        taskId,
        status: "failed",
        message: `Task not found: ${taskId}`,
      };
      return JSON.stringify(result, null, 2);
    }

    // Check task is cancellable
    if (state.status === "completed" || state.status === "failed" || state.status === "cancelled") {
      const result: OpenCodeCancelResult = {
        taskId,
        status: state.status,
        message: `Task is already in terminal state: ${state.status}`,
      };
      return JSON.stringify(result, null, 2);
    }

    // Kill the process if running
    const killed = killTaskProcess(taskId);
    Logger.debug(`Cancel task ${taskId}: process ${killed ? "killed" : "not found"}`);

    // Mark task as cancelled
    await taskManager.cancelTask(taskId);

    const result: OpenCodeCancelResult = {
      taskId,
      status: "cancelled",
      message: `Task cancelled successfully${killed ? " (process terminated)" : ""}`,
    };
    return JSON.stringify(result, null, 2);
  },
};
