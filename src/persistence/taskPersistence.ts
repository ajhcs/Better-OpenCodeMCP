/**
 * TaskPersistence - File-based persistence for crash recovery.
 * Saves task state to disk in ~/.opencode-mcp/ directory.
 * @module persistence/taskPersistence
 */

import { mkdir, readFile, writeFile, readdir, unlink, appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Logger } from "../utils/logger.js";
import type { TaskMetadata } from "../tasks/taskManager.js";
import type { OpenCodeEvent } from "../utils/jsonEventParser.js";
import type {
  PersistedTaskMetadata,
  TaskResult,
  SessionMapping,
  SessionsFile,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default base directory for persistence */
const DEFAULT_BASE_DIR = join(homedir(), ".opencode-mcp");

/** Subdirectory for task files */
const TASKS_DIR = "tasks";

/** Sessions mapping file */
const SESSIONS_FILE = "sessions.json";

/** Current file format version */
const SESSIONS_FILE_VERSION = 1;

// ============================================================================
// TaskPersistence Class
// ============================================================================

/**
 * Manages file-based persistence for task state and crash recovery.
 *
 * Storage structure:
 * ```
 * ~/.opencode-mcp/
 * +-- tasks/
 * |   +-- {taskId}.json         # Task metadata
 * |   +-- {taskId}.output.jsonl # Raw OpenCode events (NDJSON)
 * |   +-- {taskId}.result.json  # Final result
 * +-- sessions.json              # Session -> Task mapping
 * +-- config.json               # Configuration (future use)
 * ```
 *
 * @example
 * ```typescript
 * const persistence = new TaskPersistence();
 * await persistence.init();
 *
 * // Save task metadata
 * await persistence.saveTaskMetadata("task-123", metadata);
 *
 * // Append events
 * await persistence.appendEvent("task-123", event);
 *
 * // Save final result
 * await persistence.saveResult("task-123", result);
 *
 * // Load for recovery
 * const metadata = await persistence.loadTaskMetadata("task-123");
 * const events = await persistence.loadEvents("task-123");
 * ```
 */
export class TaskPersistence {
  /** Base directory for all persistence files */
  private readonly baseDir: string;

  /** Tasks subdirectory */
  private readonly tasksDir: string;

  /** Sessions file path */
  private readonly sessionsFilePath: string;

  /** Whether init() has been called */
  private initialized = false;

  /**
   * Creates a new TaskPersistence instance.
   *
   * @param baseDir - Base directory for persistence (defaults to ~/.opencode-mcp)
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_BASE_DIR;
    this.tasksDir = join(this.baseDir, TASKS_DIR);
    this.sessionsFilePath = join(this.baseDir, SESSIONS_FILE);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initializes the persistence layer by creating necessary directories.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    try {
      // Create base directory
      await mkdir(this.baseDir, { recursive: true });

      // Create tasks subdirectory
      await mkdir(this.tasksDir, { recursive: true });

      // Initialize sessions file if it doesn't exist
      const sessionsFileExists = await this.fileExists(this.sessionsFilePath);
      if (!sessionsFileExists) {
        const initialSessions: SessionsFile = {
          version: SESSIONS_FILE_VERSION,
          mappings: {},
        };
        await this.writeJsonFile(this.sessionsFilePath, initialSessions);
      }

      this.initialized = true;
      Logger.debug(`TaskPersistence initialized at ${this.baseDir}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to initialize TaskPersistence: ${message}`);
      throw error;
    }
  }

  // ============================================================================
  // Task Metadata Operations
  // ============================================================================

  /**
   * Saves task metadata to disk.
   *
   * @param taskId - The task identifier
   * @param metadata - Task metadata to save
   */
  async saveTaskMetadata(taskId: string, metadata: TaskMetadata, status = "working", statusMessage?: string): Promise<void> {
    this.ensureInitialized();

    const persisted: PersistedTaskMetadata = {
      taskId: metadata.taskId,
      sessionId: metadata.sessionId,
      title: metadata.title,
      model: metadata.model,
      agent: metadata.agent,
      createdAt: metadata.createdAt.toISOString(),
      lastEventAt: metadata.lastEventAt.toISOString(),
      status: status as PersistedTaskMetadata["status"],
      statusMessage,
    };

    const filePath = this.getMetadataPath(taskId);
    await this.writeJsonFile(filePath, persisted);
    Logger.debug(`Saved metadata for task ${taskId}`);
  }

  /**
   * Loads task metadata from disk.
   *
   * @param taskId - The task identifier
   * @returns Task metadata or null if not found
   */
  async loadTaskMetadata(taskId: string): Promise<PersistedTaskMetadata | null> {
    this.ensureInitialized();

    const filePath = this.getMetadataPath(taskId);
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as PersistedTaskMetadata;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  // ============================================================================
  // Event Operations
  // ============================================================================

  /**
   * Appends an event to the task's output log (JSONL format).
   *
   * @param taskId - The task identifier
   * @param event - OpenCode event to append
   */
  async appendEvent(taskId: string, event: OpenCodeEvent): Promise<void> {
    this.ensureInitialized();

    const filePath = this.getOutputPath(taskId);
    const line = JSON.stringify(event) + "\n";

    await appendFile(filePath, line, "utf-8");
  }

  /**
   * Loads all events for a task from the JSONL output file.
   *
   * @param taskId - The task identifier
   * @returns Array of OpenCode events (empty if file not found)
   */
  async loadEvents(taskId: string): Promise<OpenCodeEvent[]> {
    this.ensureInitialized();

    const filePath = this.getOutputPath(taskId);
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n");
      const events: OpenCodeEvent[] = [];

      for (const line of lines) {
        if (line.trim()) {
          try {
            events.push(JSON.parse(line) as OpenCodeEvent);
          } catch {
            Logger.warn(`Failed to parse event line in ${taskId}: ${line.substring(0, 50)}...`);
          }
        }
      }

      return events;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  // ============================================================================
  // Result Operations
  // ============================================================================

  /**
   * Saves the final result of a task.
   *
   * @param taskId - The task identifier
   * @param result - Task result to save
   */
  async saveResult(taskId: string, result: TaskResult): Promise<void> {
    this.ensureInitialized();

    const filePath = this.getResultPath(taskId);
    await this.writeJsonFile(filePath, result);
    Logger.debug(`Saved result for task ${taskId}`);
  }

  /**
   * Loads the final result of a task.
   *
   * @param taskId - The task identifier
   * @returns Task result or null if not found
   */
  async loadResult(taskId: string): Promise<TaskResult | null> {
    this.ensureInitialized();

    const filePath = this.getResultPath(taskId);
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as TaskResult;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  // ============================================================================
  // Task Listing and Cleanup
  // ============================================================================

  /**
   * Lists all persisted task IDs.
   *
   * @returns Array of task IDs
   */
  async listTasks(): Promise<string[]> {
    this.ensureInitialized();

    try {
      const files = await readdir(this.tasksDir);
      const taskIds = new Set<string>();

      for (const file of files) {
        // Extract task ID from filenames like "task-xxx.json", "task-xxx.output.jsonl", "task-xxx.result.json"
        // Task IDs can be "task-" followed by hex chars or any alphanumeric/hyphen combination
        const match = file.match(/^(task-[a-zA-Z0-9-]+)\.(json|output\.jsonl|result\.json)$/);
        if (match) {
          taskIds.add(match[1]);
        }
      }

      return Array.from(taskIds);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Deletes all files associated with a task.
   *
   * @param taskId - The task identifier
   */
  async deleteTask(taskId: string): Promise<void> {
    this.ensureInitialized();

    const filesToDelete = [
      this.getMetadataPath(taskId),
      this.getOutputPath(taskId),
      this.getResultPath(taskId),
    ];

    for (const filePath of filesToDelete) {
      try {
        await unlink(filePath);
      } catch (error) {
        if (!this.isNotFoundError(error)) {
          throw error;
        }
        // Ignore file not found errors
      }
    }

    Logger.debug(`Deleted task files for ${taskId}`);
  }

  // ============================================================================
  // Session Mapping Operations
  // ============================================================================

  /**
   * Saves a session to task mapping.
   *
   * @param sessionId - OpenCode session ID
   * @param taskId - Task ID
   */
  async saveSessionMapping(sessionId: string, taskId: string): Promise<void> {
    this.ensureInitialized();

    const sessions = await this.loadSessionsFile();

    sessions.mappings[sessionId] = {
      sessionId,
      taskId,
      createdAt: new Date().toISOString(),
    };

    await this.writeJsonFile(this.sessionsFilePath, sessions);
    Logger.debug(`Saved session mapping: ${sessionId} -> ${taskId}`);
  }

  /**
   * Gets the task ID associated with a session.
   *
   * @param sessionId - OpenCode session ID
   * @returns Task ID or null if not found
   */
  async getTaskIdBySession(sessionId: string): Promise<string | null> {
    this.ensureInitialized();

    const sessions = await this.loadSessionsFile();
    const mapping = sessions.mappings[sessionId];

    return mapping?.taskId ?? null;
  }

  /**
   * Removes a session mapping.
   *
   * @param sessionId - OpenCode session ID to remove
   */
  async removeSessionMapping(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const sessions = await this.loadSessionsFile();

    if (sessionId in sessions.mappings) {
      delete sessions.mappings[sessionId];
      await this.writeJsonFile(this.sessionsFilePath, sessions);
      Logger.debug(`Removed session mapping: ${sessionId}`);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Gets the file path for task metadata.
   */
  private getMetadataPath(taskId: string): string {
    return join(this.tasksDir, `${taskId}.json`);
  }

  /**
   * Gets the file path for task output events.
   */
  private getOutputPath(taskId: string): string {
    return join(this.tasksDir, `${taskId}.output.jsonl`);
  }

  /**
   * Gets the file path for task result.
   */
  private getResultPath(taskId: string): string {
    return join(this.tasksDir, `${taskId}.result.json`);
  }

  /**
   * Writes a JSON file atomically (via overwrite).
   */
  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await writeFile(filePath, content, "utf-8");
  }

  /**
   * Checks if a file exists.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath);
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Loads the sessions file.
   */
  private async loadSessionsFile(): Promise<SessionsFile> {
    try {
      const content = await readFile(this.sessionsFilePath, "utf-8");
      return JSON.parse(content) as SessionsFile;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        // Return default structure if file doesn't exist
        return {
          version: SESSIONS_FILE_VERSION,
          mappings: {},
        };
      }
      throw error;
    }
  }

  /**
   * Checks if an error is a "file not found" error.
   */
  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  }

  /**
   * Ensures that init() has been called.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("TaskPersistence not initialized. Call init() first.");
    }
  }

  // ============================================================================
  // Getters for testing
  // ============================================================================

  /**
   * Gets the base directory path.
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Gets the tasks directory path.
   */
  getTasksDir(): string {
    return this.tasksDir;
  }
}
