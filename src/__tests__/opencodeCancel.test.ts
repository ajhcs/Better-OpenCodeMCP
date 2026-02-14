import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import * as child_process from "node:child_process";
import { EventEmitter } from "node:events";
import {
  opencodeCancelTool,
  OpenCodeCancelResult,
} from "../tools/opencode-cancel.tool.js";
import {
  opencodeTool,
  cleanupActiveProcesses,
} from "../tools/opencode.tool.js";
import { setTaskManager } from "../tasks/sharedTaskManager.js";
import { TaskManager } from "../tasks/taskManager.js";

// Mock the Logger
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock("../config.js", () => ({
  getServerConfig: vi.fn(() => ({
    primaryModel: "google/gemini-2.5-pro",
    fallbackModel: "google/gemini-2.5-flash",
  })),
}));

// Mock persistence
vi.mock("../persistence/sharedPersistence.js", () => ({
  getPersistence: vi.fn(() => null),
}));

// Mock child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("opencodeCancelTool", () => {
  let mockTaskManager: TaskManager;
  let mockProcess: MockChildProcess;

  class MockChildProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 12345;
    killed = false;

    kill(signal?: string): boolean {
      this.killed = true;
      this.emit("close", null, signal || "SIGTERM");
      return true;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskManager = new TaskManager();
    setTaskManager(mockTaskManager);
    mockProcess = new MockChildProcess();
    (child_process.spawn as Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    cleanupActiveProcesses();
    setTaskManager(null);
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(opencodeCancelTool.name).toBe("opencode_cancel");
    });

    it("should have opencode category", () => {
      expect(opencodeCancelTool.category).toBe("opencode");
    });
  });

  describe("input validation", () => {
    it("should reject empty taskId", async () => {
      await expect(opencodeCancelTool.execute({ taskId: "" })).rejects.toThrow(
        "taskId is required and cannot be empty"
      );
    });

    it("should reject missing taskId", async () => {
      await expect(opencodeCancelTool.execute({})).rejects.toThrow();
    });
  });

  describe("cancel behavior", () => {
    it("should return error for non-existent task", async () => {
      const result = await opencodeCancelTool.execute({ taskId: "non-existent" });
      const parsed: OpenCodeCancelResult = JSON.parse(result);
      expect(parsed.status).toBe("failed");
      expect(parsed.message).toContain("Task not found");
    });

    it("should reject cancel of completed task", async () => {
      const taskId = await mockTaskManager.createTask({
        title: "Test",
        model: "test-model",
      });
      await mockTaskManager.handleEvent(taskId, {
        type: "step_finish",
        timestamp: Date.now(),
        sessionID: "session-123",
        part: {
          id: "1",
          type: "step-finish",
          reason: "stop",
          tokens: { input: 10, output: 10, reasoning: 0 },
          cost: 0.001,
        },
      });

      const result = await opencodeCancelTool.execute({ taskId });
      const parsed: OpenCodeCancelResult = JSON.parse(result);
      expect(parsed.status).toBe("completed");
      expect(parsed.message).toContain("terminal state");
    });

    it("should cancel a working task", async () => {
      const taskId = await mockTaskManager.createTask({
        title: "Test",
        model: "test-model",
      });

      const result = await opencodeCancelTool.execute({ taskId });
      const parsed: OpenCodeCancelResult = JSON.parse(result);
      expect(parsed.status).toBe("cancelled");
      expect(parsed.message).toContain("cancelled successfully");
    });

    it("should kill process when cancelling a running task", async () => {
      // Start a task that has an active process
      const execResult = await opencodeTool.execute({ task: "Test task" });
      const { taskId } = JSON.parse(execResult);

      const result = await opencodeCancelTool.execute({ taskId });
      const parsed: OpenCodeCancelResult = JSON.parse(result);
      expect(parsed.status).toBe("cancelled");
      expect(parsed.message).toContain("process terminated");
    });
  });
});
