/**
 * Persistence module - File-based persistence for crash recovery.
 * @module persistence
 */

export { TaskPersistence } from "./taskPersistence.js";
export type {
  PersistedTaskMetadata,
  TaskResult,
  SessionMapping,
  SessionsFile,
  ConfigFile,
} from "./types.js";
