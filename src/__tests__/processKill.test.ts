import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// Mock the Logger
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Hoist the mock function so it's available in the vi.mock factory
const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));

// Mock child_process module - killProcess imports execSync from here
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: mockExecSync,
  };
});

// Import after mocks are set up (vitest hoists vi.mock)
import { killProcess } from "../utils/processKill.js";

describe("killProcess", () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  function createMockProcess(overrides?: Record<string, unknown>): ChildProcess {
    const proc = new EventEmitter() as ChildProcess;
    Object.defineProperty(proc, "pid", { value: 12345, writable: true, configurable: true });
    Object.defineProperty(proc, "killed", { value: false, writable: true, configurable: true });
    proc.kill = vi.fn().mockImplementation(() => {
      Object.defineProperty(proc, "killed", { value: true, writable: true, configurable: true });
      return true;
    });
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        Object.defineProperty(proc, key, { value, writable: true, configurable: true });
      }
    }
    return proc;
  }

  it("should do nothing if process has no pid", () => {
    const proc = createMockProcess({ pid: undefined });
    killProcess(proc);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it("should do nothing if process is already killed", () => {
    const proc = createMockProcess({ killed: true });
    killProcess(proc);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it("should do nothing if pid is 0", () => {
    const proc = createMockProcess({ pid: 0 });
    killProcess(proc);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  describe("Unix behavior", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    });

    it("should send SIGTERM on Unix", () => {
      const proc = createMockProcess();
      proc.kill = vi.fn().mockReturnValue(true);
      killProcess(proc);
      expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should send SIGKILL after grace period if not killed", () => {
      const proc = createMockProcess();
      proc.kill = vi.fn().mockReturnValue(true);
      Object.defineProperty(proc, "killed", { value: false, writable: true, configurable: true });

      killProcess(proc);

      expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
      expect(proc.kill).not.toHaveBeenCalledWith("SIGKILL");

      vi.advanceTimersByTime(5001);

      expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("should not send SIGKILL if process already killed", () => {
      const proc = createMockProcess();
      let killCount = 0;
      proc.kill = vi.fn().mockImplementation(() => {
        killCount++;
        if (killCount === 1) {
          Object.defineProperty(proc, "killed", { value: true, writable: true, configurable: true });
        }
        return true;
      });

      killProcess(proc);
      expect(proc.kill).toHaveBeenCalledWith("SIGTERM");

      vi.advanceTimersByTime(5001);

      // SIGKILL should NOT be called because killed is already true
      expect(proc.kill).toHaveBeenCalledTimes(1);
    });
  });

  describe("Windows behavior", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    });

    it("should use taskkill on Windows", () => {
      const proc = createMockProcess({ pid: 9999 });

      killProcess(proc);

      expect(mockExecSync).toHaveBeenCalledWith(
        "taskkill /pid 9999 /T /F",
        { stdio: "ignore" }
      );
    });

    it("should not crash if taskkill fails (process already dead)", () => {
      const proc = createMockProcess({ pid: 9999 });
      mockExecSync.mockImplementation(() => {
        throw new Error("Process not found");
      });

      expect(() => killProcess(proc)).not.toThrow();
    });
  });

  it("should handle kill throwing an error gracefully", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const proc = createMockProcess();
    proc.kill = vi.fn().mockImplementation(() => {
      throw new Error("ESRCH: no such process");
    });

    expect(() => killProcess(proc)).not.toThrow();
  });
});
