import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { TaskPersistence } from "../persistence/taskPersistence.js";
import type { TaskMetadata } from "../tasks/taskManager.js";
import type {
  StepStartEvent,
  TextEvent,
  StepFinishEvent,
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

describe("TaskPersistence", () => {
  let testDir: string;
  let persistence: TaskPersistence;

  // Generate a unique test directory for each test
  const createTestDir = async (): Promise<string> => {
    const uniqueId = randomBytes(8).toString("hex");
    const dir = join(tmpdir(), `opencode-mcp-test-${uniqueId}`);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  // Sample task metadata
  const createTaskMetadata = (taskId: string, sessionId = ""): TaskMetadata => ({
    taskId,
    sessionId,
    title: "Test Task",
    model: "google/gemini-2.5-pro",
    agent: "plan",
    createdAt: new Date("2024-01-15T10:00:00Z"),
    lastEventAt: new Date("2024-01-15T10:05:00Z"),
  });

  // Sample events
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

  const createStepFinishEvent = (reason: "stop" | "tool-calls", sessionId = "session-123"): StepFinishEvent => ({
    type: "step_finish",
    timestamp: Date.now(),
    sessionID: sessionId,
    part: {
      id: "part-3",
      type: "step-finish",
      reason,
      tokens: { input: 100, output: 50, reasoning: 20 },
      cost: 0.01,
    },
  });

  // Sample result
  const createTaskResult = (taskId: string): TaskResult => ({
    taskId,
    status: "completed",
    output: "Task completed successfully",
    completedAt: new Date().toISOString(),
    durationMs: 5000,
  });

  beforeEach(async () => {
    testDir = await createTestDir();
    persistence = new TaskPersistence(testDir);
    await persistence.init();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("init", () => {
    it("should create base directory and subdirectories", async () => {
      const newDir = await createTestDir();
      const newPersistence = new TaskPersistence(newDir);

      await newPersistence.init();

      // Verify directories exist by trying to list tasks (would fail if dir doesn't exist)
      const tasks = await newPersistence.listTasks();
      expect(tasks).toEqual([]);

      // Cleanup
      await rm(newDir, { recursive: true, force: true });
    });

    it("should create sessions.json file", async () => {
      const newDir = await createTestDir();
      const newPersistence = new TaskPersistence(newDir);

      await newPersistence.init();

      // Should be able to get session mapping (would fail if file doesn't exist)
      const taskId = await newPersistence.getTaskIdBySession("nonexistent");
      expect(taskId).toBeNull();

      // Cleanup
      await rm(newDir, { recursive: true, force: true });
    });

    it("should throw error if operations called before init", async () => {
      const uninitializedPersistence = new TaskPersistence(testDir + "-uninitialized");

      await expect(
        uninitializedPersistence.saveTaskMetadata("task-123", createTaskMetadata("task-123"))
      ).rejects.toThrow("TaskPersistence not initialized");
    });
  });

  describe("saveTaskMetadata / loadTaskMetadata", () => {
    it("should save and load task metadata", async () => {
      const taskId = "task-abc123";
      const metadata = createTaskMetadata(taskId, "session-xyz");

      await persistence.saveTaskMetadata(taskId, metadata, "working");

      const loaded = await persistence.loadTaskMetadata(taskId);

      expect(loaded).not.toBeNull();
      expect(loaded!.taskId).toBe(taskId);
      expect(loaded!.sessionId).toBe("session-xyz");
      expect(loaded!.title).toBe("Test Task");
      expect(loaded!.model).toBe("google/gemini-2.5-pro");
      expect(loaded!.agent).toBe("plan");
      expect(loaded!.status).toBe("working");
      expect(loaded!.createdAt).toBe("2024-01-15T10:00:00.000Z");
      expect(loaded!.lastEventAt).toBe("2024-01-15T10:05:00.000Z");
    });

    it("should save metadata with status and statusMessage", async () => {
      const taskId = "task-def456";
      const metadata = createTaskMetadata(taskId);

      await persistence.saveTaskMetadata(taskId, metadata, "failed", "Connection timeout");

      const loaded = await persistence.loadTaskMetadata(taskId);

      expect(loaded!.status).toBe("failed");
      expect(loaded!.statusMessage).toBe("Connection timeout");
    });

    it("should return null for non-existent task metadata", async () => {
      const loaded = await persistence.loadTaskMetadata("nonexistent-task");
      expect(loaded).toBeNull();
    });

    it("should overwrite existing metadata on save", async () => {
      const taskId = "task-ghi789";
      const metadata1 = createTaskMetadata(taskId);
      const metadata2 = { ...createTaskMetadata(taskId), title: "Updated Title" };

      await persistence.saveTaskMetadata(taskId, metadata1, "working");
      await persistence.saveTaskMetadata(taskId, metadata2, "completed");

      const loaded = await persistence.loadTaskMetadata(taskId);

      expect(loaded!.title).toBe("Updated Title");
      expect(loaded!.status).toBe("completed");
    });
  });

  describe("appendEvent / loadEvents", () => {
    it("should append and load events in JSONL format", async () => {
      const taskId = "task-events-123";

      const event1 = createStepStartEvent();
      const event2 = createTextEvent("Hello ");
      const event3 = createTextEvent("World!");
      const event4 = createStepFinishEvent("stop");

      await persistence.appendEvent(taskId, event1);
      await persistence.appendEvent(taskId, event2);
      await persistence.appendEvent(taskId, event3);
      await persistence.appendEvent(taskId, event4);

      const events = await persistence.loadEvents(taskId);

      expect(events).toHaveLength(4);
      expect(events[0].type).toBe("step_start");
      expect(events[1].type).toBe("text");
      expect((events[1] as TextEvent).part.text).toBe("Hello ");
      expect(events[2].type).toBe("text");
      expect((events[2] as TextEvent).part.text).toBe("World!");
      expect(events[3].type).toBe("step_finish");
    });

    it("should return empty array for non-existent events file", async () => {
      const events = await persistence.loadEvents("nonexistent-task");
      expect(events).toEqual([]);
    });

    it("should handle malformed event lines gracefully", async () => {
      const taskId = "task-malformed";

      // Manually write a file with some malformed lines
      const event1 = createStepStartEvent();
      await persistence.appendEvent(taskId, event1);

      // Load should return only the valid event
      const events = await persistence.loadEvents(taskId);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe("step_start");
    });
  });

  describe("saveResult / loadResult", () => {
    it("should save and load task result", async () => {
      const taskId = "task-result-123";
      const result = createTaskResult(taskId);

      await persistence.saveResult(taskId, result);

      const loaded = await persistence.loadResult(taskId);

      expect(loaded).not.toBeNull();
      expect(loaded!.taskId).toBe(taskId);
      expect(loaded!.status).toBe("completed");
      expect(loaded!.output).toBe("Task completed successfully");
      expect(loaded!.durationMs).toBe(5000);
    });

    it("should return null for non-existent result", async () => {
      const loaded = await persistence.loadResult("nonexistent-task");
      expect(loaded).toBeNull();
    });
  });

  describe("listTasks", () => {
    it("should return empty array when no tasks exist", async () => {
      const tasks = await persistence.listTasks();
      expect(tasks).toEqual([]);
    });

    it("should list all task IDs", async () => {
      const taskId1 = "task-aaa111222333";
      const taskId2 = "task-bbb444555666";
      const taskId3 = "task-ccc777888999";

      await persistence.saveTaskMetadata(taskId1, createTaskMetadata(taskId1));
      await persistence.saveTaskMetadata(taskId2, createTaskMetadata(taskId2));
      await persistence.appendEvent(taskId3, createStepStartEvent());

      const tasks = await persistence.listTasks();

      expect(tasks).toHaveLength(3);
      expect(tasks).toContain(taskId1);
      expect(tasks).toContain(taskId2);
      expect(tasks).toContain(taskId3);
    });

    it("should not duplicate task IDs with multiple files", async () => {
      const taskId = "task-ddd000111222";

      await persistence.saveTaskMetadata(taskId, createTaskMetadata(taskId));
      await persistence.appendEvent(taskId, createStepStartEvent());
      await persistence.saveResult(taskId, createTaskResult(taskId));

      const tasks = await persistence.listTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toBe(taskId);
    });
  });

  describe("deleteTask", () => {
    it("should delete all task files", async () => {
      const taskId = "task-delete-123";

      await persistence.saveTaskMetadata(taskId, createTaskMetadata(taskId));
      await persistence.appendEvent(taskId, createStepStartEvent());
      await persistence.saveResult(taskId, createTaskResult(taskId));

      // Verify files exist
      let tasks = await persistence.listTasks();
      expect(tasks).toContain(taskId);

      // Delete task
      await persistence.deleteTask(taskId);

      // Verify files are gone
      tasks = await persistence.listTasks();
      expect(tasks).not.toContain(taskId);

      const metadata = await persistence.loadTaskMetadata(taskId);
      expect(metadata).toBeNull();

      const events = await persistence.loadEvents(taskId);
      expect(events).toEqual([]);

      const result = await persistence.loadResult(taskId);
      expect(result).toBeNull();
    });

    it("should not throw when deleting non-existent task", async () => {
      await expect(persistence.deleteTask("nonexistent-task")).resolves.not.toThrow();
    });
  });

  describe("session mapping", () => {
    it("should save and retrieve session to task mapping", async () => {
      const sessionId = "session-abc123";
      const taskId = "task-xyz789";

      await persistence.saveSessionMapping(sessionId, taskId);

      const retrievedTaskId = await persistence.getTaskIdBySession(sessionId);
      expect(retrievedTaskId).toBe(taskId);
    });

    it("should return null for non-existent session", async () => {
      const taskId = await persistence.getTaskIdBySession("nonexistent-session");
      expect(taskId).toBeNull();
    });

    it("should handle multiple session mappings", async () => {
      await persistence.saveSessionMapping("session-1", "task-1");
      await persistence.saveSessionMapping("session-2", "task-2");
      await persistence.saveSessionMapping("session-3", "task-3");

      expect(await persistence.getTaskIdBySession("session-1")).toBe("task-1");
      expect(await persistence.getTaskIdBySession("session-2")).toBe("task-2");
      expect(await persistence.getTaskIdBySession("session-3")).toBe("task-3");
    });

    it("should overwrite existing session mapping", async () => {
      await persistence.saveSessionMapping("session-dup", "task-old");
      await persistence.saveSessionMapping("session-dup", "task-new");

      const taskId = await persistence.getTaskIdBySession("session-dup");
      expect(taskId).toBe("task-new");
    });

    it("should remove session mapping", async () => {
      await persistence.saveSessionMapping("session-remove", "task-remove");

      let taskId = await persistence.getTaskIdBySession("session-remove");
      expect(taskId).toBe("task-remove");

      await persistence.removeSessionMapping("session-remove");

      taskId = await persistence.getTaskIdBySession("session-remove");
      expect(taskId).toBeNull();
    });

    it("should not throw when removing non-existent session mapping", async () => {
      await expect(persistence.removeSessionMapping("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete task lifecycle persistence", async () => {
      const taskId = "task-lifecycle-test";
      const sessionId = "session-lifecycle";
      const metadata = createTaskMetadata(taskId, sessionId);

      // 1. Save initial metadata and session mapping
      await persistence.saveTaskMetadata(taskId, metadata, "working");
      await persistence.saveSessionMapping(sessionId, taskId);

      // 2. Append events as task progresses
      await persistence.appendEvent(taskId, createStepStartEvent(sessionId));
      await persistence.appendEvent(taskId, createTextEvent("Processing...", sessionId));
      await persistence.appendEvent(taskId, createStepFinishEvent("tool-calls", sessionId));
      await persistence.appendEvent(taskId, createStepStartEvent(sessionId));
      await persistence.appendEvent(taskId, createTextEvent("Done!", sessionId));
      await persistence.appendEvent(taskId, createStepFinishEvent("stop", sessionId));

      // 3. Save final result
      const result: TaskResult = {
        taskId,
        status: "completed",
        output: "Processing...\nDone!",
        completedAt: new Date().toISOString(),
        durationMs: 3500,
      };
      await persistence.saveResult(taskId, result);

      // 4. Update metadata with final status
      await persistence.saveTaskMetadata(taskId, {
        ...metadata,
        lastEventAt: new Date(),
      }, "completed");

      // 5. Verify everything can be recovered
      const recoveredMetadata = await persistence.loadTaskMetadata(taskId);
      expect(recoveredMetadata!.status).toBe("completed");

      const recoveredEvents = await persistence.loadEvents(taskId);
      expect(recoveredEvents).toHaveLength(6);

      const recoveredResult = await persistence.loadResult(taskId);
      expect(recoveredResult!.status).toBe("completed");

      const recoveredTaskId = await persistence.getTaskIdBySession(sessionId);
      expect(recoveredTaskId).toBe(taskId);
    });

    it("should support recovery simulation", async () => {
      // Simulate: Server was running, saved some state, then crashed
      const taskId = "task-crash-recovery";
      const sessionId = "session-crash";
      const metadata = createTaskMetadata(taskId, sessionId);

      await persistence.saveTaskMetadata(taskId, metadata, "working");
      await persistence.saveSessionMapping(sessionId, taskId);
      await persistence.appendEvent(taskId, createStepStartEvent(sessionId));
      await persistence.appendEvent(taskId, createTextEvent("Working on it...", sessionId));

      // "Crash" - Create new persistence instance (simulating restart)
      const recoveredPersistence = new TaskPersistence(testDir);
      await recoveredPersistence.init();

      // Recover state
      const tasks = await recoveredPersistence.listTasks();
      expect(tasks).toContain(taskId);

      const recoveredMetadata = await recoveredPersistence.loadTaskMetadata(taskId);
      expect(recoveredMetadata!.status).toBe("working");

      const events = await recoveredPersistence.loadEvents(taskId);
      expect(events).toHaveLength(2);

      const sessionTaskId = await recoveredPersistence.getTaskIdBySession(sessionId);
      expect(sessionTaskId).toBe(taskId);
    });
  });

  describe("getters", () => {
    it("should expose base directory path", () => {
      expect(persistence.getBaseDir()).toBe(testDir);
    });

    it("should expose tasks directory path", () => {
      expect(persistence.getTasksDir()).toBe(join(testDir, "tasks"));
    });
  });
});
