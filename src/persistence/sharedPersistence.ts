/**
 * Shared TaskPersistence singleton for use across the application.
 * @module persistence/sharedPersistence
 */

import { TaskPersistence } from "./taskPersistence.js";
import { Logger } from "../utils/logger.js";

let sharedPersistence: TaskPersistence | null = null;

/**
 * Initializes the shared persistence singleton.
 * Non-fatal: if initialization fails, persistence is silently disabled.
 */
export async function initPersistence(): Promise<void> {
  try {
    sharedPersistence = new TaskPersistence();
    await sharedPersistence.init();
    Logger.debug("Persistence initialized");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.warn(`Persistence initialization failed (non-fatal): ${message}`);
    sharedPersistence = null;
  }
}

/**
 * Gets the shared persistence instance, or null if not initialized.
 */
export function getPersistence(): TaskPersistence | null {
  return sharedPersistence;
}

/**
 * Resets the shared persistence (useful for testing).
 */
export function resetPersistence(): void {
  sharedPersistence = null;
}
