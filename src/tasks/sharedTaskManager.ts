/**
 * Shared TaskManager instance for use across the application.
 * Uses a singleton pattern to ensure a single TaskManager is used.
 * @module sharedTaskManager
 */

import { TaskManager, TaskStatusChangeCallback } from "./taskManager.js";
import { Logger } from "../utils/logger.js";
import { getPersistence } from "../persistence/sharedPersistence.js";

let sharedTaskManager: TaskManager | null = null;

/**
 * Gets the shared TaskManager instance, creating it if necessary.
 *
 * @returns The shared TaskManager instance
 */
export function getTaskManager(): TaskManager {
  if (!sharedTaskManager) {
    // Create with status change callback that logs and persists
    sharedTaskManager = new TaskManager((taskId, status, statusMessage) => {
      Logger.debug(`Task ${taskId} status changed to: ${status}${statusMessage ? ` - ${statusMessage}` : ""}`);

      // Best-effort persistence on status change
      const persistence = getPersistence();
      if (persistence) {
        const state = sharedTaskManager?.getTaskState(taskId);
        if (state) {
          // Persist metadata update
          persistence.saveTaskMetadata(taskId, state.metadata, status, statusMessage).catch((err) => {
            Logger.debug(`Failed to persist task metadata: ${err instanceof Error ? err.message : String(err)}`);
          });

          // For terminal states, persist session mapping and result
          if (status === "completed" || status === "failed" || status === "cancelled") {
            if (state.metadata.sessionId) {
              persistence.saveSessionMapping(state.metadata.sessionId, taskId).catch((err) => {
                Logger.debug(`Failed to persist session mapping: ${err instanceof Error ? err.message : String(err)}`);
              });
            }

            persistence.saveResult(taskId, {
              taskId,
              status,
              statusMessage,
              output: state.accumulatedText,
              completedAt: new Date().toISOString(),
              durationMs: Date.now() - state.metadata.createdAt.getTime(),
            }).catch((err) => {
              Logger.debug(`Failed to persist task result: ${err instanceof Error ? err.message : String(err)}`);
            });
          }
        }
      }
    });
  }
  return sharedTaskManager;
}

/**
 * Sets a custom TaskManager instance (useful for testing).
 *
 * @param manager - The TaskManager instance to use, or null to reset
 */
export function setTaskManager(manager: TaskManager | null): void {
  sharedTaskManager = manager;
}

/**
 * Resets the shared TaskManager (useful for testing).
 */
export function resetTaskManager(): void {
  if (sharedTaskManager) {
    sharedTaskManager.cleanup();
  }
  sharedTaskManager = null;
}
