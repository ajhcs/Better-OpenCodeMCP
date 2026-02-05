import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import {
  TaskManager,
  TaskStatus,
  TaskMetadata,
  TaskStatusChangeCallback,
  INPUT_REQUIRED_IDLE_THRESHOLD_MS,
} from "../tasks/taskManager.js";
import type {
  StepStartEvent,
  TextEvent,
  ToolUseEvent,
  StepFinishEvent,
} from "../utils/jsonEventParser.js";

// Mock the Logger to prevent console output during tests
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("TaskManager", () => {
  let manager: TaskManager;
  let statusChangeCallback: Mock<TaskStatusChangeCallback>;

  // Sample events for testing
  const createStepStartEvent = (sessionId = "session-123"): StepStartEvent => ({
    type: "step_start",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: "part-1",
      type: "step-start",
      snapshot: "Initial snapshot",
    },
  });

  const createTextEvent = (text: string, sessionId = "session-123"): TextEvent => ({
    type: "text",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: "part-2",
      type: "text",
      text,
      time: { start: 0, end: 100 },
    },
  });

  const createToolUseEvent = (sessionId = "session-123"): ToolUseEvent => ({
    type: "tool_use",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: "part-3",
      type: "tool",
      tool: "read_file",
      callID: "call-123",
      state: {
        status: "completed",
        input: { path: "/test.ts" },
        output: "file contents",
        metadata: { exit: 0, truncated: false },
      },
    },
  });

  const createStepFinishEvent = (reason: "stop" | "tool-calls", sessionId = "session-123"): StepFinishEvent => ({
    type: "step_finish",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: "part-4",
      type: "step-finish",
      reason,
      tokens: { input: 100, output: 50, reasoning: 20 },
      cost: 0.01,
    },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    statusChangeCallback = vi.fn();
    manager = new TaskManager(statusChangeCallback);
  });

  afterEach(() => {
    manager.cleanup();
    vi.useRealTimers();
  });

  describe("createTask", () => {
    it("should create a task with unique ID", async () => {
      const taskId = await manager.createTask({
        title: "Test Task",
        model: "google/gemini-2.5-pro",
      });

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task-[a-f0-9]{24}$/);
    });

    it("should initialize task with working status", async () => {
      const taskId = await manager.createTask({
        title: "Test Task",
        model: "google/gemini-2.5-pro",
      });

      const status = manager.getTaskStatus(taskId);
      expect(status).toBe("working");
    });

    it("should store task metadata correctly", async () => {
      const taskId = await manager.createTask({
        title: "Analyze Code",
        model: "google/gemini-2.5-pro",
        agent: "plan",
      });

      const metadata = manager.getTaskMetadata(taskId);
      expect(metadata).toBeDefined();
      expect(metadata!.taskId).toBe(taskId);
      expect(metadata!.title).toBe("Analyze Code");
      expect(metadata!.model).toBe("google/gemini-2.5-pro");
      expect(metadata!.agent).toBe("plan");
      expect(metadata!.sessionId).toBe(""); // Not set until first event
      expect(metadata!.createdAt).toBeInstanceOf(Date);
      expect(metadata!.lastEventAt).toBeInstanceOf(Date);
    });

    it("should create multiple tasks with unique IDs", async () => {
      const taskId1 = await manager.createTask({
        title: "Task 1",
        model: "model-1",
      });
      const taskId2 = await manager.createTask({
        title: "Task 2",
        model: "model-2",
      });

      expect(taskId1).not.toBe(taskId2);
    });
  });

  describe("handleEvent - state transitions", () => {
    it("should stay working on step_start event", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());

      expect(manager.getTaskStatus(taskId)).toBe("working");
    });

    it("should set sessionId from first event", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent("my-session-456"));

      const metadata = manager.getTaskMetadata(taskId);
      expect(metadata!.sessionId).toBe("my-session-456");
    });

    it("should stay working on text event", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createTextEvent("Hello world"));

      expect(manager.getTaskStatus(taskId)).toBe("working");
    });

    it("should accumulate text from text events", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createTextEvent("Hello "));
      await manager.handleEvent(taskId, createTextEvent("world!"));

      const state = manager.getTaskState(taskId);
      expect(state!.accumulatedText).toBe("Hello world!");
    });

    it("should stay working on tool_use event", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createToolUseEvent());

      expect(manager.getTaskStatus(taskId)).toBe("working");
    });

    it("should stay working on step_finish with reason=tool-calls", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createStepFinishEvent("tool-calls"));

      expect(manager.getTaskStatus(taskId)).toBe("working");
    });

    it("should transition to completed on step_finish with reason=stop", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createTextEvent("Analysis complete."));
      await manager.handleEvent(taskId, createStepFinishEvent("stop"));

      expect(manager.getTaskStatus(taskId)).toBe("completed");
    });

    it("should invoke status change callback on completion", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepFinishEvent("stop"));

      expect(statusChangeCallback).toHaveBeenCalledWith(taskId, "completed", undefined);
    });

    it("should throw error for unknown task", async () => {
      await expect(
        manager.handleEvent("unknown-task", createStepStartEvent())
      ).rejects.toThrow("Task not found: unknown-task");
    });

    it("should ignore events for terminal tasks", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      // Complete the task
      await manager.handleEvent(taskId, createStepFinishEvent("stop"));
      expect(manager.getTaskStatus(taskId)).toBe("completed");

      // Try to send more events (should be ignored)
      await manager.handleEvent(taskId, createStepStartEvent());
      expect(manager.getTaskStatus(taskId)).toBe("completed");
    });
  });

  describe("handleEvent - input_required detection", () => {
    it("should transition to input_required after 30s idle with question", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createTextEvent("Would you like to continue?"));

      // Status should still be working
      expect(manager.getTaskStatus(taskId)).toBe("working");

      // Advance time past the threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Should now be input_required
      expect(manager.getTaskStatus(taskId)).toBe("input_required");
    });

    it("should invoke callback when transitioning to input_required", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createTextEvent("Do you want to proceed?"));

      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      expect(statusChangeCallback).toHaveBeenCalledWith(
        taskId,
        "input_required",
        "Waiting for user input"
      );
    });

    it("should cancel input_required timer on new event", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      // Send question
      await manager.handleEvent(taskId, createTextEvent("What should I do?"));

      // Advance time but not past threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS / 2);

      // Send another event (should reset timer)
      await manager.handleEvent(taskId, createTextEvent(" Let me think..."));

      // Advance past original threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS / 2 + 100);

      // Should still be working (timer was reset)
      expect(manager.getTaskStatus(taskId)).toBe("working");
    });

    it("should not trigger input_required if text does not end with question", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createTextEvent("Task completed successfully."));

      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Should still be working
      expect(manager.getTaskStatus(taskId)).toBe("working");
    });
  });

  describe("failTask", () => {
    it("should transition task to failed status", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.failTask(taskId, "Connection timeout");

      expect(manager.getTaskStatus(taskId)).toBe("failed");
    });

    it("should set error message on failed task", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.failTask(taskId, "API rate limit exceeded");

      const state = manager.getTaskState(taskId);
      expect(state!.statusMessage).toBe("API rate limit exceeded");
    });

    it("should invoke callback on failure", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.failTask(taskId, "Error occurred");

      expect(statusChangeCallback).toHaveBeenCalledWith(taskId, "failed", "Error occurred");
    });

    it("should throw error for unknown task", async () => {
      await expect(manager.failTask("unknown-task", "Error")).rejects.toThrow(
        "Task not found: unknown-task"
      );
    });

    it("should not fail already terminal task", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      // Complete the task first
      await manager.handleEvent(taskId, createStepFinishEvent("stop"));
      statusChangeCallback.mockClear();

      // Try to fail it
      await manager.failTask(taskId, "Error");

      // Should still be completed, not failed
      expect(manager.getTaskStatus(taskId)).toBe("completed");
      expect(statusChangeCallback).not.toHaveBeenCalled();
    });
  });

  describe("cancelTask", () => {
    it("should transition task to cancelled status", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.cancelTask(taskId);

      expect(manager.getTaskStatus(taskId)).toBe("cancelled");
    });

    it("should invoke callback on cancellation", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.cancelTask(taskId);

      expect(statusChangeCallback).toHaveBeenCalledWith(taskId, "cancelled", undefined);
    });

    it("should throw error for unknown task", async () => {
      await expect(manager.cancelTask("unknown-task")).rejects.toThrow(
        "Task not found: unknown-task"
      );
    });

    it("should not cancel already terminal task", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      // Fail the task first
      await manager.failTask(taskId, "Error");
      statusChangeCallback.mockClear();

      // Try to cancel it
      await manager.cancelTask(taskId);

      // Should still be failed, not cancelled
      expect(manager.getTaskStatus(taskId)).toBe("failed");
      expect(statusChangeCallback).not.toHaveBeenCalled();
    });
  });

  describe("listActiveTasks", () => {
    it("should return empty array when no tasks exist", () => {
      const tasks = manager.listActiveTasks();
      expect(tasks).toEqual([]);
    });

    it("should return active tasks only", async () => {
      const taskId1 = await manager.createTask({
        title: "Active Task 1",
        model: "model-1",
      });
      const taskId2 = await manager.createTask({
        title: "Active Task 2",
        model: "model-2",
      });
      const taskId3 = await manager.createTask({
        title: "Completed Task",
        model: "model-3",
      });

      // Complete task 3
      await manager.handleEvent(taskId3, createStepFinishEvent("stop"));

      const activeTasks = manager.listActiveTasks();

      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map((t) => t.taskId)).toContain(taskId1);
      expect(activeTasks.map((t) => t.taskId)).toContain(taskId2);
      expect(activeTasks.map((t) => t.taskId)).not.toContain(taskId3);
    });

    it("should return copies of metadata (not references)", async () => {
      await manager.createTask({
        title: "Test Task",
        model: "test-model",
      });

      const tasks = manager.listActiveTasks();
      const originalTitle = tasks[0].title;

      // Modify the returned object
      tasks[0].title = "Modified Title";

      // Re-fetch and verify original is unchanged
      const tasksAgain = manager.listActiveTasks();
      expect(tasksAgain[0].title).toBe(originalTitle);
    });
  });

  describe("listAllTasks", () => {
    it("should return all tasks including terminal ones", async () => {
      const taskId1 = await manager.createTask({
        title: "Working Task",
        model: "model-1",
      });
      const taskId2 = await manager.createTask({
        title: "Completed Task",
        model: "model-2",
      });
      const taskId3 = await manager.createTask({
        title: "Failed Task",
        model: "model-3",
      });

      // Complete task 2
      await manager.handleEvent(taskId2, createStepFinishEvent("stop"));

      // Fail task 3
      await manager.failTask(taskId3, "Error");

      const allTasks = manager.listAllTasks();

      expect(allTasks).toHaveLength(3);
      expect(allTasks.map((t) => t.taskId)).toContain(taskId1);
      expect(allTasks.map((t) => t.taskId)).toContain(taskId2);
      expect(allTasks.map((t) => t.taskId)).toContain(taskId3);
    });
  });

  describe("removeTask", () => {
    it("should remove task and return true", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      const result = manager.removeTask(taskId);

      expect(result).toBe(true);
      expect(manager.getTaskStatus(taskId)).toBeUndefined();
    });

    it("should return false for non-existent task", () => {
      const result = manager.removeTask("non-existent");
      expect(result).toBe(false);
    });

    it("should clean up input_required timer on removal", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      // Trigger timer scheduling
      await manager.handleEvent(taskId, createTextEvent("What do you think?"));

      // Remove task
      manager.removeTask(taskId);

      // Advance time - should not throw or cause issues
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Task should be gone
      expect(manager.getTaskStatus(taskId)).toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("should remove all tasks", async () => {
      const taskId1 = await manager.createTask({
        title: "Task 1",
        model: "model-1",
      });
      const taskId2 = await manager.createTask({
        title: "Task 2",
        model: "model-2",
      });

      manager.cleanup();

      expect(manager.getTaskStatus(taskId1)).toBeUndefined();
      expect(manager.getTaskStatus(taskId2)).toBeUndefined();
      expect(manager.listAllTasks()).toHaveLength(0);
    });

    it("should clear all timers", async () => {
      const taskId = await manager.createTask({
        title: "Test",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createTextEvent("Question?"));

      manager.cleanup();

      // Advance time - should not cause any callbacks
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // No errors should have occurred
      expect(manager.listAllTasks()).toHaveLength(0);
    });
  });

  describe("integration scenarios", () => {
    it("should handle a complete tool-using workflow", async () => {
      const taskId = await manager.createTask({
        title: "Code Analysis",
        model: "google/gemini-2.5-pro",
        agent: "plan",
      });

      // Step 1: Initial analysis
      await manager.handleEvent(taskId, createStepStartEvent());
      expect(manager.getTaskStatus(taskId)).toBe("working");

      await manager.handleEvent(taskId, createTextEvent("Let me analyze the code..."));
      expect(manager.getTaskStatus(taskId)).toBe("working");

      // Tool call needed
      await manager.handleEvent(taskId, createStepFinishEvent("tool-calls"));
      expect(manager.getTaskStatus(taskId)).toBe("working");

      // Step 2: Tool execution
      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createToolUseEvent());
      await manager.handleEvent(taskId, createStepFinishEvent("tool-calls"));
      expect(manager.getTaskStatus(taskId)).toBe("working");

      // Step 3: Final response
      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createTextEvent("Based on my analysis..."));
      await manager.handleEvent(taskId, createStepFinishEvent("stop"));

      expect(manager.getTaskStatus(taskId)).toBe("completed");

      // Verify callback was called for completion
      expect(statusChangeCallback).toHaveBeenCalledWith(taskId, "completed", undefined);
    });

    it("should handle error during execution", async () => {
      const taskId = await manager.createTask({
        title: "Test Task",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createTextEvent("Processing..."));

      // Simulate error
      await manager.failTask(taskId, "API quota exceeded");

      expect(manager.getTaskStatus(taskId)).toBe("failed");

      // Further events should be ignored
      await manager.handleEvent(taskId, createStepFinishEvent("stop"));
      expect(manager.getTaskStatus(taskId)).toBe("failed");
    });

    it("should handle user cancellation", async () => {
      const taskId = await manager.createTask({
        title: "Long Running Task",
        model: "test-model",
      });

      await manager.handleEvent(taskId, createStepStartEvent());
      await manager.handleEvent(taskId, createTextEvent("This will take a while..."));

      // User cancels
      await manager.cancelTask(taskId);

      expect(manager.getTaskStatus(taskId)).toBe("cancelled");
    });
  });
});
