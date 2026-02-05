/**
 * Persistence-specific types for crash recovery.
 * @module persistence/types
 */

import type { TaskStatus } from "../tasks/taskManager.js";

/**
 * Serializable version of TaskMetadata for persistence.
 * Dates are stored as ISO strings for JSON serialization.
 */
export interface PersistedTaskMetadata {
  /** Unique task identifier */
  taskId: string;
  /** OpenCode session ID */
  sessionId: string;
  /** Human-readable task title */
  title: string;
  /** Model being used */
  model: string;
  /** Agent mode (if any) */
  agent?: string;
  /** When the task was created (ISO string) */
  createdAt: string;
  /** When the last event was processed (ISO string) */
  lastEventAt: string;
  /** Current task status */
  status: TaskStatus;
  /** Optional status message */
  statusMessage?: string;
}

/**
 * Final result of a completed task.
 */
export interface TaskResult {
  /** Task ID */
  taskId: string;
  /** Final task status */
  status: TaskStatus;
  /** Status message (if any) */
  statusMessage?: string;
  /** Accumulated text output */
  output: string;
  /** When the task completed (ISO string) */
  completedAt: string;
  /** Total execution time in milliseconds */
  durationMs: number;
}

/**
 * Session to task mapping entry.
 */
export interface SessionMapping {
  /** OpenCode session ID */
  sessionId: string;
  /** Corresponding task ID */
  taskId: string;
  /** When the mapping was created (ISO string) */
  createdAt: string;
}

/**
 * Session mappings file structure.
 */
export interface SessionsFile {
  /** Version for future compatibility */
  version: number;
  /** Map of sessionId to SessionMapping */
  mappings: Record<string, SessionMapping>;
}

/**
 * Configuration file structure (for future use).
 */
export interface ConfigFile {
  /** Version for future compatibility */
  version: number;
  /** Configuration values */
  config: Record<string, unknown>;
}
