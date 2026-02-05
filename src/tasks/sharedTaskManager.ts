/**
 * Shared TaskManager instance for use across the application.
 * Uses a singleton pattern to ensure a single TaskManager is used.
 * @module sharedTaskManager
 */

import { TaskManager } from "./taskManager.js";

let sharedTaskManager: TaskManager | null = null;

/**
 * Gets the shared TaskManager instance, creating it if necessary.
 *
 * @returns The shared TaskManager instance
 */
export function getTaskManager(): TaskManager {
  if (!sharedTaskManager) {
    sharedTaskManager = new TaskManager();
  }
  return sharedTaskManager;
}

/**
 * Sets a custom TaskManager instance (useful for testing).
 *
 * @param manager - The TaskManager instance to use
 */
export function setTaskManager(manager: TaskManager): void {
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
