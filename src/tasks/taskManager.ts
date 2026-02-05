/**
 * TaskManager for MCP Tasks lifecycle management.
 * Maps OpenCode events to MCP task states.
 * @module taskManager
 */

import { randomBytes } from "node:crypto";
import { Logger } from "../utils/logger.js";
import {
  OpenCodeEvent,
  isStepStartEvent,
  isTextEvent,
  isToolUseEvent,
  isStepFinishEvent,
  isCompletionEvent,
  extractSessionId,
  extractText,
} from "../utils/jsonEventParser.js";

// ============================================================================
// Types
// ============================================================================

/**
 * MCP Task status values.
 * @see https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tasks/
 */
export type TaskStatus = "working" | "input_required" | "completed" | "failed" | "cancelled";

/**
 * Metadata associated with a task.
 */
export interface TaskMetadata {
  /** Unique task identifier */
  taskId: string;
  /** OpenCode session ID (set when first event is received) */
  sessionId: string;
  /** Human-readable task title */
  title: string;
  /** Model being used */
  model: string;
  /** Agent mode (if any) */
  agent?: string;
  /** When the task was created */
  createdAt: Date;
  /** When the last event was processed */
  lastEventAt: Date;
}

/**
 * Full task state including status and metadata.
 */
export interface TaskState {
  /** Current task status */
  status: TaskStatus;
  /** Optional status message */
  statusMessage?: string;
  /** Task metadata */
  metadata: TaskMetadata;
  /** Accumulated text output from the task */
  accumulatedText: string;
  /** Time of last text event (for input_required detection) */
  lastTextEventAt?: Date;
}

/**
 * Parameters for creating a new task.
 */
export interface CreateTaskParams {
  /** Human-readable task title */
  title: string;
  /** Model being used */
  model: string;
  /** Agent mode (if any) */
  agent?: string;
}

/**
 * Callback type for task status change notifications.
 */
export type TaskStatusChangeCallback = (
  taskId: string,
  status: TaskStatus,
  statusMessage?: string
) => void;

// ============================================================================
// Constants
// ============================================================================

/** Time in milliseconds after which a question-ending text triggers input_required */
export const INPUT_REQUIRED_IDLE_THRESHOLD_MS = 30_000; // 30 seconds

// ============================================================================
// TaskManager Class
// ============================================================================

/**
 * Manages MCP Task lifecycle, mapping OpenCode events to task states.
 *
 * @example
 * ```typescript
 * const manager = new TaskManager();
 *
 * // Create a task
 * const taskId = await manager.createTask({
 *   title: "Analyze code",
 *   model: "google/gemini-2.5-pro"
 * });
 *
 * // Process events
 * await manager.handleEvent(taskId, stepStartEvent);
 * await manager.handleEvent(taskId, textEvent);
 * await manager.handleEvent(taskId, stepFinishEvent);
 *
 * // Check status
 * const status = manager.getTaskStatus(taskId);
 * console.log(status); // "completed"
 * ```
 */
export class TaskManager {
  /** Map of taskId to task state */
  private tasks: Map<string, TaskState> = new Map();

  /** Optional callback for status changes */
  private onStatusChange?: TaskStatusChangeCallback;

  /** Timers for input_required detection */
  private inputRequiredTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Creates a new TaskManager instance.
   *
   * @param onStatusChange - Optional callback invoked when task status changes
   */
  constructor(onStatusChange?: TaskStatusChangeCallback) {
    this.onStatusChange = onStatusChange;
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Creates a new task with the given parameters.
   *
   * @param params - Task creation parameters
   * @returns The unique taskId for the created task
   */
  async createTask(params: CreateTaskParams): Promise<string> {
    const taskId = this.generateTaskId();
    const now = new Date();

    const metadata: TaskMetadata = {
      taskId,
      sessionId: "", // Will be set when first event arrives
      title: params.title,
      model: params.model,
      agent: params.agent,
      createdAt: now,
      lastEventAt: now,
    };

    const state: TaskState = {
      status: "working",
      metadata,
      accumulatedText: "",
    };

    this.tasks.set(taskId, state);
    Logger.debug(`Task created: ${taskId} - ${params.title}`);

    return taskId;
  }

  /**
   * Processes an OpenCode event and updates the task state accordingly.
   *
   * State mapping:
   * - step_start -> working
   * - text, tool_use -> stay working
   * - step_finish with reason="tool-calls" -> stay working
   * - step_finish with reason="stop" -> completed
   * - Text ending with "?" after 30s idle -> input_required
   *
   * @param taskId - The task identifier
   * @param event - The OpenCode event to process
   * @throws Error if task not found
   */
  async handleEvent(taskId: string, event: OpenCodeEvent): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Don't process events for terminal tasks
    if (this.isTerminalStatus(state.status)) {
      Logger.warn(`Ignoring event for terminal task ${taskId} (status: ${state.status})`);
      return;
    }

    // Update session ID if not set
    if (!state.metadata.sessionId) {
      state.metadata.sessionId = extractSessionId(event);
    }

    // Update last event timestamp
    state.metadata.lastEventAt = new Date();

    // Clear any pending input_required timer
    this.clearInputRequiredTimer(taskId);

    // Process event based on type
    if (isStepStartEvent(event)) {
      // Step start -> working
      this.updateStatus(taskId, "working");
    } else if (isTextEvent(event)) {
      // Text event -> stay working, accumulate text
      const text = extractText(event);
      state.accumulatedText += text;
      state.lastTextEventAt = new Date();

      // Check for question pattern and schedule input_required detection
      if (this.endsWithQuestion(state.accumulatedText)) {
        this.scheduleInputRequiredCheck(taskId);
      }
    } else if (isToolUseEvent(event)) {
      // Tool use -> stay working
      // No status change needed
    } else if (isStepFinishEvent(event)) {
      // Step finish -> check reason
      if (isCompletionEvent(event)) {
        // reason="stop" -> completed
        this.updateStatus(taskId, "completed");
      }
      // reason="tool-calls" -> stay working (more steps coming)
    }
  }

  /**
   * Gets the current status of a task.
   *
   * @param taskId - The task identifier
   * @returns The task status, or undefined if task not found
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId)?.status;
  }

  /**
   * Gets the metadata for a task.
   *
   * @param taskId - The task identifier
   * @returns The task metadata, or undefined if task not found
   */
  getTaskMetadata(taskId: string): TaskMetadata | undefined {
    const state = this.tasks.get(taskId);
    return state ? { ...state.metadata } : undefined;
  }

  /**
   * Gets the full task state.
   *
   * @param taskId - The task identifier
   * @returns The full task state, or undefined if task not found
   */
  getTaskState(taskId: string): TaskState | undefined {
    const state = this.tasks.get(taskId);
    return state ? { ...state, metadata: { ...state.metadata } } : undefined;
  }

  /**
   * Marks a task as failed with an error message.
   *
   * @param taskId - The task identifier
   * @param error - Error message describing the failure
   * @throws Error if task not found
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (this.isTerminalStatus(state.status)) {
      Logger.warn(`Cannot fail terminal task ${taskId} (status: ${state.status})`);
      return;
    }

    this.clearInputRequiredTimer(taskId);
    this.updateStatus(taskId, "failed", error);
    Logger.debug(`Task failed: ${taskId} - ${error}`);
  }

  /**
   * Cancels a task.
   *
   * @param taskId - The task identifier
   * @throws Error if task not found
   */
  async cancelTask(taskId: string): Promise<void> {
    const state = this.tasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (this.isTerminalStatus(state.status)) {
      Logger.warn(`Cannot cancel terminal task ${taskId} (status: ${state.status})`);
      return;
    }

    this.clearInputRequiredTimer(taskId);
    this.updateStatus(taskId, "cancelled");
    Logger.debug(`Task cancelled: ${taskId}`);
  }

  /**
   * Lists all active (non-terminal) tasks.
   *
   * @returns Array of metadata for all active tasks
   */
  listActiveTasks(): TaskMetadata[] {
    const activeTasks: TaskMetadata[] = [];

    for (const [, state] of this.tasks) {
      if (!this.isTerminalStatus(state.status)) {
        activeTasks.push({ ...state.metadata });
      }
    }

    return activeTasks;
  }

  /**
   * Lists all tasks (including terminal ones).
   *
   * @returns Array of metadata for all tasks
   */
  listAllTasks(): TaskMetadata[] {
    return Array.from(this.tasks.values()).map(state => ({ ...state.metadata }));
  }

  /**
   * Removes a task from the manager.
   * Useful for cleanup after tasks complete.
   *
   * @param taskId - The task identifier
   * @returns True if task was removed, false if not found
   */
  removeTask(taskId: string): boolean {
    this.clearInputRequiredTimer(taskId);
    return this.tasks.delete(taskId);
  }

  /**
   * Cleans up all resources (timers, etc.).
   * Call this when shutting down the manager.
   */
  cleanup(): void {
    for (const timer of this.inputRequiredTimers.values()) {
      clearTimeout(timer);
    }
    this.inputRequiredTimers.clear();
    this.tasks.clear();
    Logger.debug("TaskManager cleaned up");
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Generates a unique task ID using random bytes.
   */
  private generateTaskId(): string {
    return `task-${randomBytes(12).toString("hex")}`;
  }

  /**
   * Updates task status and notifies via callback if registered.
   */
  private updateStatus(taskId: string, status: TaskStatus, statusMessage?: string): void {
    const state = this.tasks.get(taskId);
    if (!state) return;

    const previousStatus = state.status;
    state.status = status;
    state.statusMessage = statusMessage;
    state.metadata.lastEventAt = new Date();

    // Notify if status changed and callback is registered
    if (previousStatus !== status && this.onStatusChange) {
      this.onStatusChange(taskId, status, statusMessage);
    }
  }

  /**
   * Checks if text ends with a question mark (after trimming).
   */
  private endsWithQuestion(text: string): boolean {
    return text.trimEnd().endsWith("?");
  }

  /**
   * Schedules a check for input_required state after idle threshold.
   */
  private scheduleInputRequiredCheck(taskId: string): void {
    // Clear any existing timer
    this.clearInputRequiredTimer(taskId);

    const timer = setTimeout(() => {
      const state = this.tasks.get(taskId);
      if (!state) return;

      // Only transition to input_required if still working and last text had question
      if (state.status === "working" && state.lastTextEventAt) {
        const elapsed = Date.now() - state.lastTextEventAt.getTime();
        if (elapsed >= INPUT_REQUIRED_IDLE_THRESHOLD_MS && this.endsWithQuestion(state.accumulatedText)) {
          this.updateStatus(taskId, "input_required", "Waiting for user input");
          Logger.debug(`Task ${taskId} transitioned to input_required after idle timeout`);
        }
      }

      this.inputRequiredTimers.delete(taskId);
    }, INPUT_REQUIRED_IDLE_THRESHOLD_MS);

    this.inputRequiredTimers.set(taskId, timer);
  }

  /**
   * Clears the input_required timer for a task.
   */
  private clearInputRequiredTimer(taskId: string): void {
    const timer = this.inputRequiredTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.inputRequiredTimers.delete(taskId);
    }
  }

  /**
   * Checks if a status is terminal (completed, failed, cancelled).
   */
  private isTerminalStatus(status: TaskStatus): boolean {
    return status === "completed" || status === "failed" || status === "cancelled";
  }
}
