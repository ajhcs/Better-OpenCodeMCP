import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  opencodeHealthTool,
  HealthStatus,
} from "../tools/opencode-health.tool.js";
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

describe("opencodeHealthTool", () => {
  let mockTaskManager: TaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskManager = new TaskManager();
    setTaskManager(mockTaskManager);
  });

  afterEach(() => {
    setTaskManager(null);
  });

  describe("tool definition", () => {
    it("should have correct name", () => {
      expect(opencodeHealthTool.name).toBe("opencode_health");
    });

    it("should have opencode category", () => {
      expect(opencodeHealthTool.category).toBe("opencode");
    });
  });

  describe("health check", () => {
    it("should return valid JSON", async () => {
      const result = await opencodeHealthTool.execute({});
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("should include all health sections", async () => {
      const result = await opencodeHealthTool.execute({});
      const health: HealthStatus = JSON.parse(result);

      expect(health.cli).toBeDefined();
      expect(health.config).toBeDefined();
      expect(health.pool).toBeDefined();
      expect(health.tasks).toBeDefined();
    });

    it("should report config correctly", async () => {
      const result = await opencodeHealthTool.execute({});
      const health: HealthStatus = JSON.parse(result);

      expect(health.config.primaryModel).toBe("google/gemini-2.5-pro");
    });

    it("should report pool status", async () => {
      const result = await opencodeHealthTool.execute({});
      const health: HealthStatus = JSON.parse(result);

      expect(health.pool.running).toBeGreaterThanOrEqual(0);
      expect(health.pool.queued).toBeGreaterThanOrEqual(0);
      expect(health.pool.maxConcurrent).toBeGreaterThan(0);
    });

    it("should report task counts", async () => {
      const result = await opencodeHealthTool.execute({});
      const health: HealthStatus = JSON.parse(result);

      expect(health.tasks.active).toBe(0);
      expect(health.tasks.total).toBe(0);
    });

    it("should reflect active tasks", async () => {
      await mockTaskManager.createTask({
        title: "Test Task",
        model: "test-model",
      });

      const result = await opencodeHealthTool.execute({});
      const health: HealthStatus = JSON.parse(result);

      expect(health.tasks.active).toBe(1);
      expect(health.tasks.total).toBe(1);
    });

    it("should check CLI availability", async () => {
      const result = await opencodeHealthTool.execute({});
      const health: HealthStatus = JSON.parse(result);

      // CLI may or may not be available in test environment
      expect(typeof health.cli.available).toBe("boolean");
    });
  });
});
