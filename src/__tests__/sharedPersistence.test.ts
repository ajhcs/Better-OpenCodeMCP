import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the Logger
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// We test the actual sharedPersistence module but need to handle
// that it creates a real TaskPersistence. We'll mock taskPersistence
// at a lower level to control init behavior.

describe("sharedPersistence", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), "omcp-test-"));
  });

  afterEach(async () => {
    // Clean up module state and temp directory
    const { resetPersistence } = await import("../persistence/sharedPersistence.js");
    resetPersistence();
    await rm(tmpDir, { recursive: true, force: true });
    // Reset module cache so each test gets fresh state
    vi.resetModules();
  });

  describe("getPersistence", () => {
    it("should return null before initialization", async () => {
      const { getPersistence } = await import("../persistence/sharedPersistence.js");
      expect(getPersistence()).toBeNull();
    });
  });

  describe("initPersistence", () => {
    it("should initialize and make persistence available", async () => {
      // Use fresh module import to get clean state
      const { initPersistence, getPersistence } = await import("../persistence/sharedPersistence.js");

      await initPersistence();

      expect(getPersistence()).not.toBeNull();
    });

    it("should create a TaskPersistence with working methods", async () => {
      const { initPersistence, getPersistence } = await import("../persistence/sharedPersistence.js");

      await initPersistence();

      const p = getPersistence();
      expect(p).not.toBeNull();
      expect(typeof p!.appendEvent).toBe("function");
      expect(typeof p!.saveTaskMetadata).toBe("function");
      expect(typeof p!.init).toBe("function");
    });
  });

  describe("resetPersistence", () => {
    it("should clear the singleton", async () => {
      const { initPersistence, getPersistence, resetPersistence } = await import("../persistence/sharedPersistence.js");

      await initPersistence();
      expect(getPersistence()).not.toBeNull();

      resetPersistence();

      expect(getPersistence()).toBeNull();
    });

    it("should allow re-initialization after reset", async () => {
      const { initPersistence, getPersistence, resetPersistence } = await import("../persistence/sharedPersistence.js");

      await initPersistence();
      resetPersistence();
      expect(getPersistence()).toBeNull();

      await initPersistence();
      expect(getPersistence()).not.toBeNull();
    });
  });
});
