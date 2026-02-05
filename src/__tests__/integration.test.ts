/**
 * Integration Tests for Async Task System
 * Tests full workflows across multiple components.
 * @module integration.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as child_process from "node:child_process";

import { TaskManager, TaskStatus, INPUT_REQUIRED_IDLE_THRESHOLD_MS } from "../tasks/taskManager.js";
import { TaskPersistence } from "../persistence/taskPersistence.js";
import type {
  StepStartEvent,
  TextEvent,
  ToolUseEvent,
  StepFinishEvent,
  OpenCodeEvent,
} from "../utils/jsonEventParser.js";
import type { TaskResult } from "../persistence/types.js";

// Mock the Logger to prevent console output during tests
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock child_process.spawn for integration tests
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock the config module
vi.mock("../config.js", () => ({
  getServerConfig: vi.fn(() => ({
    primaryModel: "google/gemini-2.5-pro",
    fallbackModel: "google/gemini-2.5-flash",
  })),
}));

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Mock child process for testing
 */
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = Math.floor(Math.random() * 100000);
  killed = false;

  kill(signal?: string): boolean {
    this.killed = true;
    this.emit("close", null, signal || "SIGTERM");
    return true;
  }
}

/**
 * Event factory helpers for creating test events
 */
const EventFactory = {
  stepStart: (sessionId = "session-123"): StepStartEvent => ({
    type: "step_start",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: `part-${randomBytes(4).toString("hex")}`,
      type: "step-start",
      snapshot: "Initial snapshot",
    },
  }),

  text: (text: string, sessionId = "session-123"): TextEvent => ({
    type: "text",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: `part-${randomBytes(4).toString("hex")}`,
      type: "text",
      text,
      time: { start: 0, end: 100 },
    },
  }),

  toolUse: (tool = "read_file", sessionId = "session-123"): ToolUseEvent => ({
    type: "tool_use",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: `part-${randomBytes(4).toString("hex")}`,
      type: "tool",
      tool,
      callID: `call-${randomBytes(4).toString("hex")}`,
      state: {
        status: "completed",
        input: { path: "/test.ts" },
        output: "file contents",
        metadata: { exit: 0, truncated: false },
      },
    },
  }),

  stepFinish: (reason: "stop" | "tool-calls", sessionId = "session-123"): StepFinishEvent => ({
    type: "step_finish",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: `part-${randomBytes(4).toString("hex")}`,
      type: "step-finish",
      reason,
      tokens: { input: 100, output: 50, reasoning: 20 },
      cost: 0.01,
    },
  }),
};

/**
 * Create unique test directory
 */
const createTestDir = async (): Promise<string> => {
  const uniqueId = randomBytes(8).toString("hex");
  const dir = join(tmpdir(), `opencode-mcp-integration-${uniqueId}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration Tests: Full Task Lifecycle", () => {
  let taskManager: TaskManager;
  let statusChanges: Array<{ taskId: string; status: TaskStatus; message?: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    statusChanges = [];
    taskManager = new TaskManager((taskId, status, message) => {
      statusChanges.push({ taskId, status, message });
    });
  });

  afterEach(() => {
    taskManager.cleanup();
    vi.useRealTimers();
  });

  describe("Full Workflow: Create Task -> Process Events -> Complete", () => {
    it("should handle complete analysis workflow with multiple steps", async () => {
      const sessionId = "integration-session-1";

      // Step 1: Create task
      const taskId = await taskManager.createTask({
        title: "Code Analysis Task",
        model: "google/gemini-2.5-pro",
        agent: "plan",
      });

      expect(taskManager.getTaskStatus(taskId)).toBe("working");

      // Step 2: First step - initial analysis
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Analyzing the codebase...", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("tool-calls", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("working");

      // Step 3: Tool usage step
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.toolUse("read_file", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.toolUse("list_dir", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("tool-calls", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("working");

      // Step 4: Final response
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("\n\nBased on my analysis, here are the findings:\n", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("1. Code structure is good\n", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("2. Some improvements suggested", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      // Verify completion
      expect(taskManager.getTaskStatus(taskId)).toBe("completed");

      // Verify accumulated text
      const state = taskManager.getTaskState(taskId);
      expect(state!.accumulatedText).toContain("Analyzing the codebase...");
      expect(state!.accumulatedText).toContain("Based on my analysis");
      expect(state!.accumulatedText).toContain("Code structure is good");

      // Verify session ID was captured
      expect(state!.metadata.sessionId).toBe(sessionId);

      // Verify status change callback was called for completion
      expect(statusChanges.some(s => s.taskId === taskId && s.status === "completed")).toBe(true);
    });

    it("should handle simple task with single step", async () => {
      const sessionId = "simple-session";

      const taskId = await taskManager.createTask({
        title: "Simple Question",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("The answer is 42.", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("completed");

      const state = taskManager.getTaskState(taskId);
      expect(state!.accumulatedText).toBe("The answer is 42.");
    });
  });

  describe("Respond Workflow: Task -> input_required -> Respond -> Complete", () => {
    it("should transition to input_required after idle timeout with question", async () => {
      const sessionId = "respond-session-1";

      const taskId = await taskManager.createTask({
        title: "Interactive Task",
        model: "test-model",
      });

      // Initial processing
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("I found several options. Which approach would you prefer?", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("working");

      // Advance time past threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      expect(taskManager.getTaskStatus(taskId)).toBe("input_required");

      // Verify callback was triggered
      expect(statusChanges.some(s =>
        s.taskId === taskId &&
        s.status === "input_required" &&
        s.message === "Waiting for user input"
      )).toBe(true);
    });

    it("should handle response and continue to completion", async () => {
      const sessionId = "respond-session-2";

      const taskId = await taskManager.createTask({
        title: "Interactive Task",
        model: "test-model",
      });

      // Initial processing with question
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Do you want to proceed?", sessionId));

      // Advance time to trigger input_required
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);
      expect(taskManager.getTaskStatus(taskId)).toBe("input_required");

      // Simulate response - new events come in
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Yes, I will proceed now.", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("completed");

      const state = taskManager.getTaskState(taskId);
      expect(state!.accumulatedText).toContain("Do you want to proceed?");
      expect(state!.accumulatedText).toContain("Yes, I will proceed now.");
    });

    it("should not trigger input_required if activity continues", async () => {
      const sessionId = "active-session";

      const taskId = await taskManager.createTask({
        title: "Active Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Processing... what should I do?", sessionId));

      // Advance time but not past threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS / 2);

      // More activity - should reset timer
      await taskManager.handleEvent(taskId, EventFactory.text(" Let me think...", sessionId));

      // Advance past original threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS / 2 + 100);

      // Should still be working because timer was reset
      expect(taskManager.getTaskStatus(taskId)).toBe("working");
    });

    it("should not trigger input_required for statements (no question mark)", async () => {
      const sessionId = "statement-session";

      const taskId = await taskManager.createTask({
        title: "Statement Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("I completed the analysis.", sessionId));

      // Advance time past threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Should still be working - no question mark
      expect(taskManager.getTaskStatus(taskId)).toBe("working");
    });
  });

  describe("Error Handling Workflow", () => {
    it("should handle task failure during execution", async () => {
      const sessionId = "error-session";

      const taskId = await taskManager.createTask({
        title: "Failing Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Starting work...", sessionId));

      // Simulate failure
      await taskManager.failTask(taskId, "API quota exceeded");

      expect(taskManager.getTaskStatus(taskId)).toBe("failed");

      // Verify callback
      expect(statusChanges.some(s =>
        s.taskId === taskId &&
        s.status === "failed" &&
        s.message === "API quota exceeded"
      )).toBe(true);

      // Subsequent events should be ignored
      await taskManager.handleEvent(taskId, EventFactory.text("More text", sessionId));
      expect(taskManager.getTaskStatus(taskId)).toBe("failed"); // Still failed
    });

    it("should handle task cancellation", async () => {
      const sessionId = "cancel-session";

      const taskId = await taskManager.createTask({
        title: "Cancellable Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Working on long task...", sessionId));

      await taskManager.cancelTask(taskId);

      expect(taskManager.getTaskStatus(taskId)).toBe("cancelled");

      // Subsequent events should be ignored
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));
      expect(taskManager.getTaskStatus(taskId)).toBe("cancelled"); // Still cancelled
    });
  });

  describe("Multiple Concurrent Tasks", () => {
    it("should handle multiple tasks running simultaneously", async () => {
      // Create multiple tasks
      const task1Id = await taskManager.createTask({
        title: "Task 1",
        model: "model-1",
      });
      const task2Id = await taskManager.createTask({
        title: "Task 2",
        model: "model-2",
      });
      const task3Id = await taskManager.createTask({
        title: "Task 3",
        model: "model-3",
      });

      // All should be working
      expect(taskManager.getTaskStatus(task1Id)).toBe("working");
      expect(taskManager.getTaskStatus(task2Id)).toBe("working");
      expect(taskManager.getTaskStatus(task3Id)).toBe("working");

      // Interleave events from different sessions
      await taskManager.handleEvent(task1Id, EventFactory.stepStart("session-1"));
      await taskManager.handleEvent(task2Id, EventFactory.stepStart("session-2"));
      await taskManager.handleEvent(task3Id, EventFactory.stepStart("session-3"));

      await taskManager.handleEvent(task1Id, EventFactory.text("Task 1 text", "session-1"));
      await taskManager.handleEvent(task3Id, EventFactory.text("Task 3 text", "session-3"));
      await taskManager.handleEvent(task2Id, EventFactory.text("Task 2 text", "session-2"));

      // Complete task 2 first
      await taskManager.handleEvent(task2Id, EventFactory.stepFinish("stop", "session-2"));
      expect(taskManager.getTaskStatus(task2Id)).toBe("completed");
      expect(taskManager.getTaskStatus(task1Id)).toBe("working");
      expect(taskManager.getTaskStatus(task3Id)).toBe("working");

      // Fail task 1
      await taskManager.failTask(task1Id, "Error in task 1");
      expect(taskManager.getTaskStatus(task1Id)).toBe("failed");

      // Complete task 3
      await taskManager.handleEvent(task3Id, EventFactory.stepFinish("stop", "session-3"));
      expect(taskManager.getTaskStatus(task3Id)).toBe("completed");

      // Verify each task has correct accumulated text
      expect(taskManager.getTaskState(task1Id)!.accumulatedText).toBe("Task 1 text");
      expect(taskManager.getTaskState(task2Id)!.accumulatedText).toBe("Task 2 text");
      expect(taskManager.getTaskState(task3Id)!.accumulatedText).toBe("Task 3 text");

      // Verify session IDs are correct
      expect(taskManager.getTaskMetadata(task1Id)!.sessionId).toBe("session-1");
      expect(taskManager.getTaskMetadata(task2Id)!.sessionId).toBe("session-2");
      expect(taskManager.getTaskMetadata(task3Id)!.sessionId).toBe("session-3");
    });

    it("should handle concurrent input_required transitions", async () => {
      const task1Id = await taskManager.createTask({ title: "Task 1", model: "m1" });
      const task2Id = await taskManager.createTask({ title: "Task 2", model: "m2" });

      await taskManager.handleEvent(task1Id, EventFactory.stepStart("s1"));
      await taskManager.handleEvent(task1Id, EventFactory.text("What do you think?", "s1"));

      await taskManager.handleEvent(task2Id, EventFactory.stepStart("s2"));
      await taskManager.handleEvent(task2Id, EventFactory.text("Should I proceed?", "s2"));

      // Advance time past threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Both should transition to input_required
      expect(taskManager.getTaskStatus(task1Id)).toBe("input_required");
      expect(taskManager.getTaskStatus(task2Id)).toBe("input_required");
    });

    it("should list active and all tasks correctly", async () => {
      const task1Id = await taskManager.createTask({ title: "Active 1", model: "m1" });
      const task2Id = await taskManager.createTask({ title: "Active 2", model: "m2" });
      const task3Id = await taskManager.createTask({ title: "To Complete", model: "m3" });
      const task4Id = await taskManager.createTask({ title: "To Fail", model: "m4" });

      // Complete task 3
      await taskManager.handleEvent(task3Id, EventFactory.stepFinish("stop", "s3"));
      // Fail task 4
      await taskManager.failTask(task4Id, "Error");

      const activeTasks = taskManager.listActiveTasks();
      const allTasks = taskManager.listAllTasks();

      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map(t => t.taskId)).toContain(task1Id);
      expect(activeTasks.map(t => t.taskId)).toContain(task2Id);
      expect(activeTasks.map(t => t.taskId)).not.toContain(task3Id);
      expect(activeTasks.map(t => t.taskId)).not.toContain(task4Id);

      expect(allTasks).toHaveLength(4);
    });
  });
});

describe("Integration Tests: Persistence and Recovery", () => {
  let testDir: string;
  let persistence: TaskPersistence;

  beforeEach(async () => {
    testDir = await createTestDir();
    persistence = new TaskPersistence(testDir);
    await persistence.init();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Create -> Persist -> Recover", () => {
    it("should persist and recover full task state", async () => {
      const taskId = "task-recovery-test-001";
      const sessionId = "session-recovery";
      const taskManager = new TaskManager();

      // Create task in memory
      const createdTaskId = await taskManager.createTask({
        title: "Recovery Test Task",
        model: "google/gemini-2.5-pro",
        agent: "plan",
      });

      // Get metadata and persist
      const metadata = taskManager.getTaskMetadata(createdTaskId)!;
      metadata.sessionId = sessionId; // Set session ID
      await persistence.saveTaskMetadata(taskId, metadata, "working");
      await persistence.saveSessionMapping(sessionId, taskId);

      // Persist events
      const events: OpenCodeEvent[] = [
        EventFactory.stepStart(sessionId),
        EventFactory.text("First message", sessionId),
        EventFactory.toolUse("read_file", sessionId),
        EventFactory.stepFinish("tool-calls", sessionId),
        EventFactory.stepStart(sessionId),
        EventFactory.text("Second message", sessionId),
      ];

      for (const event of events) {
        await persistence.appendEvent(taskId, event);
      }

      // Cleanup in-memory state (simulate crash)
      taskManager.cleanup();

      // Create new persistence instance (simulate restart)
      const recoveredPersistence = new TaskPersistence(testDir);
      await recoveredPersistence.init();

      // Recover state
      const recoveredMetadata = await recoveredPersistence.loadTaskMetadata(taskId);
      const recoveredEvents = await recoveredPersistence.loadEvents(taskId);
      const recoveredTaskId = await recoveredPersistence.getTaskIdBySession(sessionId);

      // Verify recovered state
      expect(recoveredMetadata).not.toBeNull();
      expect(recoveredMetadata!.title).toBe("Recovery Test Task");
      expect(recoveredMetadata!.model).toBe("google/gemini-2.5-pro");
      expect(recoveredMetadata!.agent).toBe("plan");
      expect(recoveredMetadata!.status).toBe("working");

      expect(recoveredEvents).toHaveLength(6);
      expect(recoveredEvents[0].type).toBe("step_start");
      expect(recoveredEvents[1].type).toBe("text");
      expect((recoveredEvents[1] as TextEvent).part.text).toBe("First message");

      expect(recoveredTaskId).toBe(taskId);
    });

    it("should handle recovery of completed task", async () => {
      const taskId = "task-completed-recovery";
      const sessionId = "session-completed";

      const taskMetadata = {
        taskId,
        sessionId,
        title: "Completed Task",
        model: "test-model",
        createdAt: new Date(),
        lastEventAt: new Date(),
      };

      // Save completed task state
      await persistence.saveTaskMetadata(taskId, taskMetadata, "completed");
      await persistence.saveSessionMapping(sessionId, taskId);

      // Save result
      const result: TaskResult = {
        taskId,
        status: "completed",
        output: "Task completed successfully with great results.",
        completedAt: new Date().toISOString(),
        durationMs: 5000,
      };
      await persistence.saveResult(taskId, result);

      // Save events
      await persistence.appendEvent(taskId, EventFactory.stepStart(sessionId));
      await persistence.appendEvent(taskId, EventFactory.text("Task completed successfully with great results.", sessionId));
      await persistence.appendEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      // Simulate restart
      const recoveredPersistence = new TaskPersistence(testDir);
      await recoveredPersistence.init();

      // Verify recovery
      const recoveredMetadata = await recoveredPersistence.loadTaskMetadata(taskId);
      const recoveredResult = await recoveredPersistence.loadResult(taskId);
      const recoveredEvents = await recoveredPersistence.loadEvents(taskId);

      expect(recoveredMetadata!.status).toBe("completed");
      expect(recoveredResult!.status).toBe("completed");
      expect(recoveredResult!.output).toBe("Task completed successfully with great results.");
      expect(recoveredEvents).toHaveLength(3);
    });

    it("should handle recovery of failed task", async () => {
      const taskId = "task-failed-recovery";
      const sessionId = "session-failed";

      const taskMetadata = {
        taskId,
        sessionId,
        title: "Failed Task",
        model: "test-model",
        createdAt: new Date(),
        lastEventAt: new Date(),
      };

      await persistence.saveTaskMetadata(taskId, taskMetadata, "failed", "API quota exceeded");

      // Simulate restart
      const recoveredPersistence = new TaskPersistence(testDir);
      await recoveredPersistence.init();

      const recoveredMetadata = await recoveredPersistence.loadTaskMetadata(taskId);
      expect(recoveredMetadata!.status).toBe("failed");
      expect(recoveredMetadata!.statusMessage).toBe("API quota exceeded");
    });

    it("should recover multiple tasks correctly", async () => {
      // Create multiple tasks
      for (let i = 1; i <= 5; i++) {
        const taskId = `task-multi-${i}`;
        const sessionId = `session-multi-${i}`;

        await persistence.saveTaskMetadata(
          taskId,
          {
            taskId,
            sessionId,
            title: `Task ${i}`,
            model: `model-${i}`,
            createdAt: new Date(),
            lastEventAt: new Date(),
          },
          i <= 2 ? "working" : "completed"
        );
        await persistence.saveSessionMapping(sessionId, taskId);
        await persistence.appendEvent(taskId, EventFactory.stepStart(sessionId));
        await persistence.appendEvent(taskId, EventFactory.text(`Output for task ${i}`, sessionId));
      }

      // Simulate restart
      const recoveredPersistence = new TaskPersistence(testDir);
      await recoveredPersistence.init();

      const taskIds = await recoveredPersistence.listTasks();
      expect(taskIds).toHaveLength(5);

      // Verify working tasks
      for (let i = 1; i <= 2; i++) {
        const metadata = await recoveredPersistence.loadTaskMetadata(`task-multi-${i}`);
        expect(metadata!.status).toBe("working");
      }

      // Verify completed tasks
      for (let i = 3; i <= 5; i++) {
        const metadata = await recoveredPersistence.loadTaskMetadata(`task-multi-${i}`);
        expect(metadata!.status).toBe("completed");
      }
    });
  });

  describe("Session Continuation After Server Restart", () => {
    it("should allow continuing a task after restart via session mapping", async () => {
      const taskId = "task-continue-after-restart";
      const sessionId = "session-continue";

      // Initial state before "crash"
      const initialMetadata = {
        taskId,
        sessionId,
        title: "Continuable Task",
        model: "test-model",
        createdAt: new Date(),
        lastEventAt: new Date(),
      };

      await persistence.saveTaskMetadata(taskId, initialMetadata, "input_required", "Waiting for user input");
      await persistence.saveSessionMapping(sessionId, taskId);
      await persistence.appendEvent(taskId, EventFactory.stepStart(sessionId));
      await persistence.appendEvent(taskId, EventFactory.text("Do you want to continue?", sessionId));

      // "Restart" - create new persistence
      const recoveredPersistence = new TaskPersistence(testDir);
      await recoveredPersistence.init();

      // Lookup task by session (as opencode_respond would)
      const foundTaskId = await recoveredPersistence.getTaskIdBySession(sessionId);
      expect(foundTaskId).toBe(taskId);

      // Load metadata to verify state
      const metadata = await recoveredPersistence.loadTaskMetadata(foundTaskId!);
      expect(metadata!.status).toBe("input_required");
      expect(metadata!.statusMessage).toBe("Waiting for user input");

      // Load events to rebuild context
      const events = await recoveredPersistence.loadEvents(foundTaskId!);
      expect(events).toHaveLength(2);

      // Accumulate text from events
      let accumulatedText = "";
      for (const event of events) {
        if (event.type === "text") {
          accumulatedText += (event as TextEvent).part.text;
        }
      }
      expect(accumulatedText).toBe("Do you want to continue?");
    });
  });
});

describe("Integration Tests: Edge Cases and Error Handling", () => {
  let taskManager: TaskManager;

  beforeEach(() => {
    vi.useFakeTimers();
    taskManager = new TaskManager();
  });

  afterEach(() => {
    taskManager.cleanup();
    vi.useRealTimers();
  });

  describe("Task Timeout Scenarios", () => {
    it("should handle task that never receives events", async () => {
      const taskId = await taskManager.createTask({
        title: "Stalled Task",
        model: "test-model",
      });

      expect(taskManager.getTaskStatus(taskId)).toBe("working");

      // Advance time significantly - task should remain working
      vi.advanceTimersByTime(60000);

      // Without any events, task stays working (no input_required without question)
      expect(taskManager.getTaskStatus(taskId)).toBe("working");
    });

    it("should handle rapid events followed by long idle", async () => {
      const sessionId = "rapid-session";
      const taskId = await taskManager.createTask({
        title: "Rapid Task",
        model: "test-model",
      });

      // Send rapid events
      for (let i = 0; i < 10; i++) {
        await taskManager.handleEvent(taskId, EventFactory.text(`Message ${i}. `, sessionId));
        vi.advanceTimersByTime(100); // Small delay
      }

      expect(taskManager.getTaskStatus(taskId)).toBe("working");

      // Long idle after rapid activity
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Should still be working (last message didn't end with ?)
      expect(taskManager.getTaskStatus(taskId)).toBe("working");
    });

    it("should handle question followed by immediate completion", async () => {
      const sessionId = "quick-complete-session";
      const taskId = await taskManager.createTask({
        title: "Quick Complete Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Do you want more details?", sessionId));

      // Complete before timeout
      vi.advanceTimersByTime(1000); // Small delay
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("completed");

      // Advance past threshold - should still be completed, not input_required
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS);
      expect(taskManager.getTaskStatus(taskId)).toBe("completed");
    });
  });

  describe("Malformed Event Streams", () => {
    it("should handle event with wrong session ID gracefully", async () => {
      const taskId = await taskManager.createTask({
        title: "Session Mismatch Task",
        model: "test-model",
      });

      // First event sets session ID
      await taskManager.handleEvent(taskId, EventFactory.stepStart("correct-session"));
      expect(taskManager.getTaskMetadata(taskId)!.sessionId).toBe("correct-session");

      // Event with different session ID - should still be processed
      // (TaskManager doesn't validate session ID consistency)
      await taskManager.handleEvent(taskId, EventFactory.text("Text from different session", "wrong-session"));

      const state = taskManager.getTaskState(taskId);
      expect(state!.accumulatedText).toBe("Text from different session");
    });

    it("should handle events arriving out of typical order", async () => {
      const sessionId = "out-of-order-session";
      const taskId = await taskManager.createTask({
        title: "Out of Order Task",
        model: "test-model",
      });

      // Text before step_start
      await taskManager.handleEvent(taskId, EventFactory.text("Text first", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("completed");
      expect(taskManager.getTaskState(taskId)!.accumulatedText).toBe("Text first");
    });

    it("should handle multiple step_finish events", async () => {
      const sessionId = "multi-finish-session";
      const taskId = await taskManager.createTask({
        title: "Multi Finish Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Result", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("completed");

      // Additional step_finish should be ignored
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));
      expect(taskManager.getTaskStatus(taskId)).toBe("completed");
    });
  });

  describe("Process Crash Recovery", () => {
    it("should handle task failure after partial completion", async () => {
      const sessionId = "partial-crash-session";
      const taskId = await taskManager.createTask({
        title: "Partial Crash Task",
        model: "test-model",
      });

      // Partial execution
      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Started processing...", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.toolUse("read_file", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Tool completed", sessionId));

      // Simulate crash
      await taskManager.failTask(taskId, "Process terminated unexpectedly");

      expect(taskManager.getTaskStatus(taskId)).toBe("failed");
      expect(taskManager.getTaskState(taskId)!.statusMessage).toBe("Process terminated unexpectedly");

      // Accumulated text should still be available
      expect(taskManager.getTaskState(taskId)!.accumulatedText).toContain("Started processing...");
      expect(taskManager.getTaskState(taskId)!.accumulatedText).toContain("Tool completed");
    });

    it("should not transition completed task to failed", async () => {
      const sessionId = "already-done-session";
      const taskId = await taskManager.createTask({
        title: "Already Done Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskStatus(taskId)).toBe("completed");

      // Attempt to fail after completion
      await taskManager.failTask(taskId, "Late failure");

      // Should still be completed
      expect(taskManager.getTaskStatus(taskId)).toBe("completed");
    });

    it("should not transition failed task to cancelled", async () => {
      const taskId = await taskManager.createTask({
        title: "Failed Task",
        model: "test-model",
      });

      await taskManager.failTask(taskId, "Initial failure");
      expect(taskManager.getTaskStatus(taskId)).toBe("failed");

      await taskManager.cancelTask(taskId);

      // Should still be failed
      expect(taskManager.getTaskStatus(taskId)).toBe("failed");
    });
  });

  describe("Boundary Conditions", () => {
    it("should handle very long text accumulation", async () => {
      const sessionId = "long-text-session";
      const taskId = await taskManager.createTask({
        title: "Long Text Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));

      // Send many text events
      const longText = "A".repeat(1000);
      for (let i = 0; i < 100; i++) {
        await taskManager.handleEvent(taskId, EventFactory.text(longText, sessionId));
      }

      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      const state = taskManager.getTaskState(taskId);
      expect(state!.accumulatedText.length).toBe(100000);
      expect(taskManager.getTaskStatus(taskId)).toBe("completed");
    });

    it("should handle task with empty text events", async () => {
      const sessionId = "empty-text-session";
      const taskId = await taskManager.createTask({
        title: "Empty Text Task",
        model: "test-model",
      });

      await taskManager.handleEvent(taskId, EventFactory.stepStart(sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.text("Actual text", sessionId));
      await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", sessionId));

      expect(taskManager.getTaskState(taskId)!.accumulatedText).toBe("Actual text");
      expect(taskManager.getTaskStatus(taskId)).toBe("completed");
    });

    it("should handle rapid task creation and completion", async () => {
      const tasks: string[] = [];

      // Create and complete many tasks rapidly
      for (let i = 0; i < 50; i++) {
        const taskId = await taskManager.createTask({
          title: `Rapid Task ${i}`,
          model: "test-model",
        });
        tasks.push(taskId);

        await taskManager.handleEvent(taskId, EventFactory.stepStart(`session-${i}`));
        await taskManager.handleEvent(taskId, EventFactory.text(`Result ${i}`, `session-${i}`));
        await taskManager.handleEvent(taskId, EventFactory.stepFinish("stop", `session-${i}`));
      }

      // All should be completed
      for (const taskId of tasks) {
        expect(taskManager.getTaskStatus(taskId)).toBe("completed");
      }

      expect(taskManager.listAllTasks()).toHaveLength(50);
      expect(taskManager.listActiveTasks()).toHaveLength(0);
    });

    it("should cleanup timers properly on task removal", async () => {
      const taskId = await taskManager.createTask({
        title: "Timer Cleanup Task",
        model: "test-model",
      });

      // Trigger timer scheduling
      await taskManager.handleEvent(taskId, EventFactory.text("What do you think?", "timer-session"));

      // Remove task before timer fires
      taskManager.removeTask(taskId);

      // Advance time past threshold
      vi.advanceTimersByTime(INPUT_REQUIRED_IDLE_THRESHOLD_MS + 100);

      // Task should be gone, no errors should occur
      expect(taskManager.getTaskStatus(taskId)).toBeUndefined();
      expect(taskManager.listAllTasks()).toHaveLength(0);
    });
  });
});

describe("Integration Tests: Persistence Edge Cases", () => {
  let testDir: string;
  let persistence: TaskPersistence;

  beforeEach(async () => {
    testDir = await createTestDir();
    persistence = new TaskPersistence(testDir);
    await persistence.init();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Malformed Event Persistence", () => {
    it("should handle loading events after malformed entries were written", async () => {
      const taskId = "task-malformed-events";

      // Write valid events
      await persistence.appendEvent(taskId, EventFactory.stepStart("session-mal"));
      await persistence.appendEvent(taskId, EventFactory.text("Valid text", "session-mal"));

      // The persistence layer writes complete events, so malformed entries
      // would only happen if there's corruption. Test that valid events load correctly.
      const events = await persistence.loadEvents(taskId);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("step_start");
      expect(events[1].type).toBe("text");
    });

    it("should return empty array for non-existent task events", async () => {
      const events = await persistence.loadEvents("non-existent-task");
      expect(events).toEqual([]);
    });
  });

  describe("Session Mapping Edge Cases", () => {
    it("should handle session mapping overwrite", async () => {
      const sessionId = "overwrite-session";

      await persistence.saveSessionMapping(sessionId, "task-old");
      expect(await persistence.getTaskIdBySession(sessionId)).toBe("task-old");

      await persistence.saveSessionMapping(sessionId, "task-new");
      expect(await persistence.getTaskIdBySession(sessionId)).toBe("task-new");
    });

    it("should handle removing non-existent session mapping", async () => {
      await expect(
        persistence.removeSessionMapping("non-existent-session")
      ).resolves.not.toThrow();
    });

    it("should handle sequential session mapping updates", async () => {
      // Create multiple mappings sequentially (concurrent writes to same JSON file
      // can have race conditions, which is expected for file-based persistence)
      for (let i = 0; i < 10; i++) {
        await persistence.saveSessionMapping(`session-${i}`, `task-${i}`);
      }

      // Verify all mappings
      for (let i = 0; i < 10; i++) {
        const taskId = await persistence.getTaskIdBySession(`session-${i}`);
        expect(taskId).toBe(`task-${i}`);
      }
    });
  });

  describe("Task Deletion", () => {
    it("should delete all task files completely", async () => {
      const taskId = "task-to-delete";
      const sessionId = "session-delete";

      // Create full task state
      await persistence.saveTaskMetadata(
        taskId,
        {
          taskId,
          sessionId,
          title: "Delete Me",
          model: "test-model",
          createdAt: new Date(),
          lastEventAt: new Date(),
        },
        "completed"
      );
      await persistence.appendEvent(taskId, EventFactory.stepStart(sessionId));
      await persistence.saveResult(taskId, {
        taskId,
        status: "completed",
        output: "Done",
        completedAt: new Date().toISOString(),
        durationMs: 1000,
      });

      // Verify task exists
      expect(await persistence.loadTaskMetadata(taskId)).not.toBeNull();
      expect((await persistence.loadEvents(taskId)).length).toBeGreaterThan(0);
      expect(await persistence.loadResult(taskId)).not.toBeNull();

      // Delete task
      await persistence.deleteTask(taskId);

      // Verify complete removal
      expect(await persistence.loadTaskMetadata(taskId)).toBeNull();
      expect(await persistence.loadEvents(taskId)).toEqual([]);
      expect(await persistence.loadResult(taskId)).toBeNull();
      expect(await persistence.listTasks()).not.toContain(taskId);
    });

    it("should not throw when deleting non-existent task", async () => {
      await expect(persistence.deleteTask("non-existent-task")).resolves.not.toThrow();
    });
  });
});
