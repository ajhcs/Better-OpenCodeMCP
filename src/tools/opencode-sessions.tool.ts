/**
 * OpenCode Sessions Tool - List and monitor active and recent OpenCode sessions.
 * @module opencodeSessions
 */

import { z } from "zod";
import { UnifiedTool } from "./registry.js";
import { getTaskManager } from "../tasks/sharedTaskManager.js";
import { TaskStatus } from "../tasks/taskManager.js";

/**
 * Session information returned by the tool.
 */
interface SessionInfo {
  taskId: string;
  sessionId: string;
  title: string;
  status: TaskStatus;
  model: string;
  agent?: string;
  createdAt: string;
  lastEventAt: string;
}

/**
 * Output schema for the sessions tool.
 */
interface SessionsOutput {
  sessions: SessionInfo[];
  total: number;
}

/**
 * Zod schema for input validation.
 */
const opencodeSessionsArgsSchema = z.object({
  status: z
    .enum(["active", "all"])
    .optional()
    .default("active")
    .describe("Filter by status: 'active' for running tasks only, 'all' for all tasks including completed"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum number of sessions to return"),
});

/**
 * OpenCode Sessions Tool Definition
 *
 * Lists all active and recent OpenCode sessions for monitoring and management.
 */
export const opencodeSessionsTool: UnifiedTool = {
  name: "opencode_sessions",
  description: `List and monitor OpenCode tasks. Essential for tracking async task progress and finding tasks that need attention.

USE THIS TOOL when you need to:
- Check if a delegated task has completed
- Find tasks waiting for input (status: "input_required")
- Monitor multiple concurrent tasks
- Review recent task history

POLLING PATTERN:
After starting a task with opencode, periodically call this tool to check progress:
1. Call opencode_sessions with status: "active"
2. Check each task's status field
3. Handle based on status:
   - "working": Task still running, check again later
   - "input_required": Use opencode_respond to provide input
   - "completed": Task finished successfully, review results
   - "failed": Task encountered an error

STATUS MEANINGS:
- working: Task is actively executing
- input_required: Task paused, waiting for user input via opencode_respond
- completed: Task finished successfully
- failed: Task encountered an error and stopped

INPUTS:
- status: "active" (running tasks only) or "all" (includes completed/failed)
- limit: Maximum sessions to return (default: 10)

RETURNS: { sessions: [...], total: number }

Each session contains: taskId, sessionId, title, status, model, agent, createdAt, lastEventAt`,
  zodSchema: opencodeSessionsArgsSchema,
  category: "utility",

  execute: async (args): Promise<string> => {
    const status = (args.status as "active" | "all") || "active";
    const limit = (args.limit as number) || 10;

    const taskManager = getTaskManager();

    // Get tasks based on status filter
    const tasks = status === "active"
      ? taskManager.listActiveTasks()
      : taskManager.listAllTasks();

    // Sort by lastEventAt descending (most recent first)
    const sortedTasks = tasks.sort((a, b) => {
      return b.lastEventAt.getTime() - a.lastEventAt.getTime();
    });

    // Apply limit
    const limitedTasks = sortedTasks.slice(0, limit);

    // Get status for each task and format output
    const sessions: SessionInfo[] = limitedTasks.map((metadata) => {
      const taskStatus = taskManager.getTaskStatus(metadata.taskId) || "working";

      return {
        taskId: metadata.taskId,
        sessionId: metadata.sessionId,
        title: metadata.title,
        status: taskStatus,
        model: metadata.model,
        agent: metadata.agent,
        createdAt: metadata.createdAt.toISOString(),
        lastEventAt: metadata.lastEventAt.toISOString(),
      };
    });

    const output: SessionsOutput = {
      sessions,
      total: tasks.length,
    };

    return JSON.stringify(output, null, 2);
  },
};
