/**
 * Shared TaskManager instance for use across the application.
 * Uses a singleton pattern to ensure a single TaskManager is used.
 * @module sharedTaskManager
 */

import { TaskManager, TaskStatusChangeCallback } from "./taskManager.js";
import { Logger } from "../utils/logger.js";

let sharedTaskManager: TaskManager | null = null;

/**
 * Gets the shared TaskManager instance, creating it if necessary.
 *
 * @returns The shared TaskManager instance
 */
export function getTaskManager(): TaskManager {
  if (!sharedTaskManager) {
    // Create with default status change callback for logging
    sharedTaskManager = new TaskManager((taskId, status, statusMessage) => {
      Logger.debug(`Task ${taskId} status changed to: ${status}${statusMessage ? ` - ${statusMessage}` : ""}`);
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
