import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import * as child_process from "node:child_process";
import { EventEmitter } from "node:events";
import {
  opencodeTool,
  cleanupActiveProcesses,
  getActiveProcessCount,
  OpenCodeToolResult,
} from "../tools/opencode.tool.js";
import { getTaskManager, setTaskManager } from "../tasks/sharedTaskManager.js";
import { TaskManager } from "../tasks/taskManager.js";

// Mock the Logger to prevent console output during tests
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the config module
vi.mock("../config.js", () => ({
  getServerConfig: vi.fn(() => ({
    primaryModel: "google/gemini-2.5-pro",
    fallbackModel: "google/gemini-2.5-flash",
  })),
}));

// Mock child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("opencodeTool", () => {
  let mockTaskManager: TaskManager;
  let mockProcess: MockChildProcess;

  // Helper class to mock ChildProcess
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

    // Create fresh mock task manager
    mockTaskManager = new TaskManager();
    setTaskManager(mockTaskManager);

    // Create fresh mock process
    mockProcess = new MockChildProcess();
    (child_process.spawn as Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    cleanupActiveProcesses();
    setTaskManager(null);
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(opencodeTool.name).toBe("opencode");
    });

    it("should have description", () => {
      expect(opencodeTool.description).toContain("Delegate a task to OpenCode");
    });

    it("should have opencode category", () => {
      expect(opencodeTool.category).toBe("opencode");
    });

    it("should have Zod schema defined", () => {
      expect(opencodeTool.zodSchema).toBeDefined();
    });
  });

  describe("input validation", () => {
    it("should reject empty task", async () => {
      await expect(opencodeTool.execute({ task: "" })).rejects.toThrow(
        "Task is required and cannot be empty"
      );
    });

    it("should reject whitespace-only task", async () => {
      await expect(opencodeTool.execute({ task: "   " })).rejects.toThrow(
        "Task is required and cannot be empty"
      );
    });

    it("should reject missing task", async () => {
      await expect(opencodeTool.execute({})).rejects.toThrow();
    });

    it("should accept valid task", async () => {
      const result = await opencodeTool.execute({ task: "Analyze the codebase" });
      expect(result).toBeDefined();
    });

    it("should accept task with all optional parameters", async () => {
      const result = await opencodeTool.execute({
        task: "Build a new feature",
        agent: "build",
        model: "custom-model",
        outputGuidance: "Return JSON format",
        sessionTitle: "Feature Build Session",
      });
      expect(result).toBeDefined();
    });
  });

  describe("execute - immediate return", () => {
    it("should return taskId immediately", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      expect(parsed.taskId).toBeDefined();
      expect(parsed.taskId).toMatch(/^task-[a-f0-9]{24}$/);
    });

    it("should return status as working", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      expect(parsed.status).toBe("working");
    });

    it("should return sessionId (initially empty)", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      expect(parsed.sessionId).toBeDefined();
      expect(parsed.sessionId).toBe(""); // Empty until first event
    });

    it("should return valid JSON", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });

      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe("execute - process spawning", () => {
    it("should spawn opencode process with correct command", async () => {
      await opencodeTool.execute({ task: "Test task" });

      expect(child_process.spawn).toHaveBeenCalledWith(
        "opencode",
        expect.any(Array),
        expect.objectContaining({
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        })
      );
    });

    it("should pass model flag", async () => {
      await opencodeTool.execute({ task: "Test task" });

      const args = (child_process.spawn as Mock).mock.calls[0][1];
      expect(args).toContain("-m");
      expect(args).toContain("google/gemini-2.5-pro");
    });

    it("should pass --format json flag", async () => {
      await opencodeTool.execute({ task: "Test task" });

      const args = (child_process.spawn as Mock).mock.calls[0][1];
      expect(args).toContain("--format");
      expect(args).toContain("json");
    });

    it("should pass agent flag when provided", async () => {
      await opencodeTool.execute({ task: "Test task", agent: "plan" });

      const args = (child_process.spawn as Mock).mock.calls[0][1];
      expect(args).toContain("--agent");
      expect(args).toContain("plan");
    });

    it("should not pass agent flag when not provided", async () => {
      await opencodeTool.execute({ task: "Test task" });

      const args = (child_process.spawn as Mock).mock.calls[0][1];
      expect(args).not.toContain("--agent");
    });

    it("should use custom model when provided", async () => {
      await opencodeTool.execute({ task: "Test task", model: "custom-model" });

      const args = (child_process.spawn as Mock).mock.calls[0][1];
      const modelIndex = args.indexOf("-m");
      expect(args[modelIndex + 1]).toBe("custom-model");
    });

    it("should append output guidance to task", async () => {
      await opencodeTool.execute({
        task: "Analyze code",
        outputGuidance: "Return as bullet points",
      });

      const args = (child_process.spawn as Mock).mock.calls[0][1];
      const lastArg = args[args.length - 1];
      expect(lastArg).toContain("Analyze code");
      expect(lastArg).toContain("Output guidance: Return as bullet points");
    });
  });

  describe("task creation", () => {
    it("should create task in TaskManager", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const status = mockTaskManager.getTaskStatus(parsed.taskId);
      expect(status).toBe("working");
    });

    it("should store task metadata", async () => {
      const result = await opencodeTool.execute({
        task: "Analyze the codebase",
        agent: "plan",
        sessionTitle: "Code Analysis",
      });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const metadata = mockTaskManager.getTaskMetadata(parsed.taskId);
      expect(metadata).toBeDefined();
      expect(metadata!.title).toBe("Code Analysis");
      expect(metadata!.agent).toBe("plan");
      expect(metadata!.model).toBe("google/gemini-2.5-pro");
    });

    it("should generate title from task if not provided", async () => {
      const result = await opencodeTool.execute({
        task: "This is a very long task description that should be truncated",
      });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const metadata = mockTaskManager.getTaskMetadata(parsed.taskId);
      expect(metadata!.title).toContain("OpenCode task:");
      expect(metadata!.title.length).toBeLessThanOrEqual(70);
    });
  });

  describe("event processing", () => {
    it("should process step_start event", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      // Simulate step_start event
      const event = JSON.stringify({
        type: "step_start",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: {
          id: "part-1",
          type: "step-start",
          snapshot: "Initial",
        },
      });

      mockProcess.stdout.emit("data", Buffer.from(event + "\n"));

      // Give time for event processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Task should still be working
      const status = mockTaskManager.getTaskStatus(parsed.taskId);
      expect(status).toBe("working");

      // Session ID should be set
      const metadata = mockTaskManager.getTaskMetadata(parsed.taskId);
      expect(metadata!.sessionId).toBe("session-abc");
    });

    it("should process text event", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const event = JSON.stringify({
        type: "text",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: {
          id: "part-2",
          type: "text",
          text: "Hello world",
          time: { start: 0, end: 100 },
        },
      });

      mockProcess.stdout.emit("data", Buffer.from(event + "\n"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const state = mockTaskManager.getTaskState(parsed.taskId);
      expect(state!.accumulatedText).toBe("Hello world");
    });

    it("should process step_finish with stop reason as completed", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const event = JSON.stringify({
        type: "step_finish",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: {
          id: "part-3",
          type: "step-finish",
          reason: "stop",
          tokens: { input: 100, output: 50, reasoning: 20 },
          cost: 0.01,
        },
      });

      mockProcess.stdout.emit("data", Buffer.from(event + "\n"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = mockTaskManager.getTaskStatus(parsed.taskId);
      expect(status).toBe("completed");
    });

    it("should handle multiple events in a single chunk", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const event1 = JSON.stringify({
        type: "step_start",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: { id: "1", type: "step-start", snapshot: "" },
      });

      const event2 = JSON.stringify({
        type: "text",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: { id: "2", type: "text", text: "Test", time: { start: 0, end: 100 } },
      });

      mockProcess.stdout.emit("data", Buffer.from(event1 + "\n" + event2 + "\n"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const state = mockTaskManager.getTaskState(parsed.taskId);
      expect(state!.accumulatedText).toBe("Test");
    });

    it("should handle incomplete lines across chunks", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      const event = JSON.stringify({
        type: "text",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: { id: "1", type: "text", text: "Hello", time: { start: 0, end: 100 } },
      });

      // Send first half
      mockProcess.stdout.emit("data", Buffer.from(event.slice(0, 50)));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Text should not be processed yet
      let state = mockTaskManager.getTaskState(parsed.taskId);
      expect(state!.accumulatedText).toBe("");

      // Send second half with newline
      mockProcess.stdout.emit("data", Buffer.from(event.slice(50) + "\n"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now text should be processed
      state = mockTaskManager.getTaskState(parsed.taskId);
      expect(state!.accumulatedText).toBe("Hello");
    });
  });

  describe("process error handling", () => {
    it("should fail task on process error", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      mockProcess.emit("error", new Error("Spawn failed"));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = mockTaskManager.getTaskStatus(parsed.taskId);
      expect(status).toBe("failed");
    });

    it("should fail task on non-zero exit code", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      mockProcess.emit("close", 1, null);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = mockTaskManager.getTaskStatus(parsed.taskId);
      expect(status).toBe("failed");
    });

    it("should fail task on signal termination", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      mockProcess.emit("close", null, "SIGKILL");

      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = mockTaskManager.getTaskStatus(parsed.taskId);
      expect(status).toBe("failed");
    });

    it("should not fail already completed task on exit", async () => {
      const result = await opencodeTool.execute({ task: "Test task" });
      const parsed: OpenCodeToolResult = JSON.parse(result);

      // Complete the task first
      const event = JSON.stringify({
        type: "step_finish",
        timestamp: Date.now(),
        sessionID: "session-abc",
        part: {
          id: "1",
          type: "step-finish",
          reason: "stop",
          tokens: { input: 100, output: 50, reasoning: 20 },
          cost: 0.01,
        },
      });

      mockProcess.stdout.emit("data", Buffer.from(event + "\n"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockTaskManager.getTaskStatus(parsed.taskId)).toBe("completed");

      // Now close with exit code 0
      mockProcess.emit("close", 0, null);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still be completed, not failed
      expect(mockTaskManager.getTaskStatus(parsed.taskId)).toBe("completed");
    });
  });

  describe("getTaskManager", () => {
    it("should return singleton instance", () => {
      setTaskManager(null);

      const manager1 = getTaskManager();
      const manager2 = getTaskManager();

      expect(manager1).toBe(manager2);
    });

    it("should create manager if none exists", () => {
      setTaskManager(null);

      const manager = getTaskManager();

      expect(manager).toBeInstanceOf(TaskManager);
    });
  });

  describe("process cleanup", () => {
    it("should track active processes", async () => {
      expect(getActiveProcessCount()).toBe(0);

      await opencodeTool.execute({ task: "Task 1" });
      expect(getActiveProcessCount()).toBe(1);

      await opencodeTool.execute({ task: "Task 2" });
      expect(getActiveProcessCount()).toBe(2);
    });

    it("should remove process from tracking on close", async () => {
      await opencodeTool.execute({ task: "Test task" });
      expect(getActiveProcessCount()).toBe(1);

      mockProcess.emit("close", 0, null);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(getActiveProcessCount()).toBe(0);
    });

    it("should clean up all processes on cleanupActiveProcesses", async () => {
      await opencodeTool.execute({ task: "Task 1" });
      await opencodeTool.execute({ task: "Task 2" });

      expect(getActiveProcessCount()).toBe(2);

      cleanupActiveProcesses();

      expect(getActiveProcessCount()).toBe(0);
    });
  });

  describe("Zod schema validation", () => {
    it("should validate task as required string", () => {
      const result = opencodeTool.zodSchema.safeParse({ task: "Valid task" });
      expect(result.success).toBe(true);
    });

    it("should reject invalid agent value", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "Valid task",
        agent: "invalid-agent",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid agent values", () => {
      for (const agent of ["explore", "plan", "build"]) {
        const result = opencodeTool.zodSchema.safeParse({
          task: "Valid task",
          agent,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid model format", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "Valid task",
        model: "invalid model name",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid model format", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "Valid task",
        model: "google/gemini-2.5-pro",
      });
      expect(result.success).toBe(true);
    });

    it("should accept nested provider model format", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "Valid task",
        model: "lmstudio/google/gemma-3n-e4b",
      });
      expect(result.success).toBe(true);
    });

    it("should accept various valid model formats", () => {
      const validModels = [
        "anthropic/claude-sonnet-4-20250514",
        "openai/gpt-4o",
        "deepseek/deepseek-chat",
        "google/gemini-2.5-flash",
        "lmstudio/google/gemma-3n-e4b",
        "ollama/llama3.1",
      ];
      for (const model of validModels) {
        const result = opencodeTool.zodSchema.safeParse({
          task: "Valid task",
          model,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject model without provider prefix", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "Valid task",
        model: "gemini-2.5-pro",
      });
      expect(result.success).toBe(false);
    });

    it("should reject task exceeding max length", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "x".repeat(100_001),
      });
      expect(result.success).toBe(false);
    });

    it("should accept optional parameters as undefined", () => {
      const result = opencodeTool.zodSchema.safeParse({
        task: "Valid task",
        agent: undefined,
        model: undefined,
        outputGuidance: undefined,
        sessionTitle: undefined,
      });
      expect(result.success).toBe(true);
    });
  });
});
