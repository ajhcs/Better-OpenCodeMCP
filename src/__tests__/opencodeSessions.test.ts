import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { opencodeSessionsTool } from "../tools/opencode-sessions.tool.js";
import { TaskManager } from "../tasks/taskManager.js";
import { setTaskManager, resetTaskManager } from "../tasks/sharedTaskManager.js";
import type { StepFinishEvent, StepStartEvent } from "../utils/jsonEventParser.js";

// Mock the Logger to prevent console output during tests
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("opencode_sessions tool", () => {
  let taskManager: TaskManager;

  // Helper to create step_start event
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

  // Helper to create step_finish event with stop reason (completion)
  const createStepFinishEvent = (
    reason: "stop" | "tool-calls",
    sessionId = "session-123"
  ): StepFinishEvent => ({
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
    taskManager = new TaskManager();
    setTaskManager(taskManager);
  });

  afterEach(() => {
    resetTaskManager();
    vi.useRealTimers();
  });

  describe("with no sessions", () => {
    it("should return empty sessions array when no tasks exist", async () => {
      const result = await opencodeSessionsTool.execute({});
      const output = JSON.parse(result);

      expect(output.sessions).toEqual([]);
      expect(output.total).toBe(0);
    });

    it("should return empty for active filter with no active tasks", async () => {
      const result = await opencodeSessionsTool.execute({ status: "active" });
      const output = JSON.parse(result);

      expect(output.sessions).toEqual([]);
      expect(output.total).toBe(0);
    });

    it("should return empty for all filter with no tasks", async () => {
      const result = await opencodeSessionsTool.execute({ status: "all" });
      const output = JSON.parse(result);

      expect(output.sessions).toEqual([]);
      expect(output.total).toBe(0);
    });
  });

  describe("with active sessions", () => {
    it("should return active sessions with default filter", async () => {
      const taskId = await taskManager.createTask({
        title: "Test Task",
        model: "google/gemini-2.5-pro",
        agent: "plan",
      });

      await taskManager.handleEvent(taskId, createStepStartEvent("session-abc"));

      const result = await opencodeSessionsTool.execute({});
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(1);
      expect(output.total).toBe(1);

      const session = output.sessions[0];
      expect(session.taskId).toBe(taskId);
      expect(session.sessionId).toBe("session-abc");
      expect(session.title).toBe("Test Task");
      expect(session.status).toBe("working");
      expect(session.model).toBe("google/gemini-2.5-pro");
      expect(session.agent).toBe("plan");
      expect(session.createdAt).toBeDefined();
      expect(session.lastEventAt).toBeDefined();
    });

    it("should return multiple active sessions sorted by lastEventAt descending", async () => {
      // Create first task
      const taskId1 = await taskManager.createTask({
        title: "First Task",
        model: "model-1",
      });
      await taskManager.handleEvent(taskId1, createStepStartEvent("session-1"));

      // Advance time
      vi.advanceTimersByTime(1000);

      // Create second task
      const taskId2 = await taskManager.createTask({
        title: "Second Task",
        model: "model-2",
      });
      await taskManager.handleEvent(taskId2, createStepStartEvent("session-2"));

      const result = await opencodeSessionsTool.execute({});
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(2);
      expect(output.total).toBe(2);

      // Most recent should be first
      expect(output.sessions[0].title).toBe("Second Task");
      expect(output.sessions[1].title).toBe("First Task");
    });

    it("should include sessions without agent property", async () => {
      const taskId = await taskManager.createTask({
        title: "No Agent Task",
        model: "test-model",
        // No agent specified
      });

      const result = await opencodeSessionsTool.execute({});
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(1);
      expect(output.sessions[0].agent).toBeUndefined();
    });
  });

  describe("filtering", () => {
    it("should filter active tasks with status='active'", async () => {
      // Create an active task
      const activeTaskId = await taskManager.createTask({
        title: "Active Task",
        model: "model-1",
      });
      await taskManager.handleEvent(activeTaskId, createStepStartEvent());

      // Create and complete another task
      const completedTaskId = await taskManager.createTask({
        title: "Completed Task",
        model: "model-2",
      });
      await taskManager.handleEvent(completedTaskId, createStepFinishEvent("stop"));

      const result = await opencodeSessionsTool.execute({ status: "active" });
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(1);
      expect(output.sessions[0].taskId).toBe(activeTaskId);
      expect(output.total).toBe(1);
    });

    it("should return all tasks with status='all'", async () => {
      // Create an active task
      const activeTaskId = await taskManager.createTask({
        title: "Active Task",
        model: "model-1",
      });
      await taskManager.handleEvent(activeTaskId, createStepStartEvent("session-1"));

      // Create and complete another task
      const completedTaskId = await taskManager.createTask({
        title: "Completed Task",
        model: "model-2",
      });
      await taskManager.handleEvent(
        completedTaskId,
        createStepStartEvent("session-2")
      );
      await taskManager.handleEvent(completedTaskId, createStepFinishEvent("stop"));

      const result = await opencodeSessionsTool.execute({ status: "all" });
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(2);
      expect(output.total).toBe(2);

      // Verify both are included
      const taskIds = output.sessions.map((s: { taskId: string }) => s.taskId);
      expect(taskIds).toContain(activeTaskId);
      expect(taskIds).toContain(completedTaskId);
    });

    it("should include completed, failed, and cancelled tasks in 'all' filter", async () => {
      const completedTask = await taskManager.createTask({
        title: "Completed",
        model: "m1",
      });
      await taskManager.handleEvent(completedTask, createStepFinishEvent("stop"));

      const failedTask = await taskManager.createTask({ title: "Failed", model: "m2" });
      await taskManager.failTask(failedTask, "Error occurred");

      const cancelledTask = await taskManager.createTask({
        title: "Cancelled",
        model: "m3",
      });
      await taskManager.cancelTask(cancelledTask);

      const result = await opencodeSessionsTool.execute({ status: "all" });
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(3);
      expect(output.total).toBe(3);

      const statuses = output.sessions.map((s: { status: string }) => s.status);
      expect(statuses).toContain("completed");
      expect(statuses).toContain("failed");
      expect(statuses).toContain("cancelled");
    });
  });

  describe("limit", () => {
    it("should respect limit parameter", async () => {
      // Create 5 tasks
      for (let i = 0; i < 5; i++) {
        const taskId = await taskManager.createTask({
          title: `Task ${i + 1}`,
          model: `model-${i}`,
        });
        await taskManager.handleEvent(taskId, createStepStartEvent(`session-${i}`));
        vi.advanceTimersByTime(100);
      }

      const result = await opencodeSessionsTool.execute({ limit: 3 });
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(3);
      expect(output.total).toBe(5); // Total is still 5
    });

    it("should use default limit of 10", async () => {
      // Create 15 tasks
      for (let i = 0; i < 15; i++) {
        const taskId = await taskManager.createTask({
          title: `Task ${i + 1}`,
          model: `model-${i}`,
        });
        await taskManager.handleEvent(taskId, createStepStartEvent(`session-${i}`));
      }

      const result = await opencodeSessionsTool.execute({});
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(10);
      expect(output.total).toBe(15);
    });

    it("should return all tasks if fewer than limit", async () => {
      // Create 3 tasks
      for (let i = 0; i < 3; i++) {
        const taskId = await taskManager.createTask({
          title: `Task ${i + 1}`,
          model: `model-${i}`,
        });
        await taskManager.handleEvent(taskId, createStepStartEvent(`session-${i}`));
      }

      const result = await opencodeSessionsTool.execute({ limit: 10 });
      const output = JSON.parse(result);

      expect(output.sessions).toHaveLength(3);
      expect(output.total).toBe(3);
    });

    it("should combine filter and limit correctly", async () => {
      // Create 3 active tasks
      for (let i = 0; i < 3; i++) {
        const taskId = await taskManager.createTask({
          title: `Active ${i + 1}`,
          model: `model-${i}`,
        });
        await taskManager.handleEvent(taskId, createStepStartEvent(`session-${i}`));
        vi.advanceTimersByTime(100);
      }

      // Create 2 completed tasks
      for (let i = 0; i < 2; i++) {
        const taskId = await taskManager.createTask({
          title: `Completed ${i + 1}`,
          model: `model-c${i}`,
        });
        await taskManager.handleEvent(taskId, createStepFinishEvent("stop"));
      }

      // Active filter with limit
      const activeResult = await opencodeSessionsTool.execute({
        status: "active",
        limit: 2,
      });
      const activeOutput = JSON.parse(activeResult);
      expect(activeOutput.sessions).toHaveLength(2);
      expect(activeOutput.total).toBe(3);

      // All filter with limit
      const allResult = await opencodeSessionsTool.execute({
        status: "all",
        limit: 2,
      });
      const allOutput = JSON.parse(allResult);
      expect(allOutput.sessions).toHaveLength(2);
      expect(allOutput.total).toBe(5);
    });
  });

  describe("output format", () => {
    it("should format dates as ISO strings", async () => {
      const taskId = await taskManager.createTask({
        title: "Test Task",
        model: "test-model",
      });
      await taskManager.handleEvent(taskId, createStepStartEvent());

      const result = await opencodeSessionsTool.execute({});
      const output = JSON.parse(result);

      const session = output.sessions[0];

      // Verify ISO format
      expect(session.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
      expect(session.lastEventAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );

      // Verify they are valid dates
      expect(new Date(session.createdAt).getTime()).not.toBeNaN();
      expect(new Date(session.lastEventAt).getTime()).not.toBeNaN();
    });

    it("should return valid JSON", async () => {
      await taskManager.createTask({
        title: "Test Task",
        model: "test-model",
      });

      const result = await opencodeSessionsTool.execute({});

      // Should not throw
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("sessions");
      expect(parsed).toHaveProperty("total");
    });
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(opencodeSessionsTool.name).toBe("opencode_sessions");
    });

    it("should have description", () => {
      expect(opencodeSessionsTool.description).toBeDefined();
      expect(opencodeSessionsTool.description.length).toBeGreaterThan(0);
    });

    it("should have zod schema", () => {
      expect(opencodeSessionsTool.zodSchema).toBeDefined();
    });

    it("should have utility category", () => {
      expect(opencodeSessionsTool.category).toBe("utility");
    });
  });
});
