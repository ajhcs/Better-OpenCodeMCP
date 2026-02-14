import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessPool } from "../utils/processPool.js";

// Mock the constants
vi.mock("../constants.js", () => ({
  PROCESS: {
    POOL_SIZE: 5,
  },
}));

describe("ProcessPool", () => {
  let pool: ProcessPool;

  beforeEach(() => {
    pool = new ProcessPool({ maxConcurrent: 2 });
  });

  describe("constructor", () => {
    it("should initialize with specified max concurrent", () => {
      const status = pool.getStatus();
      expect(status.maxConcurrent).toBe(2);
      expect(status.running).toBe(0);
      expect(status.queued).toBe(0);
    });
  });

  describe("execute", () => {
    it("should execute a task immediately when under limit", async () => {
      const result = await pool.execute(async () => "done");
      expect(result).toBe("done");
    });

    it("should execute multiple tasks concurrently up to limit", async () => {
      const executionOrder: number[] = [];
      let resolve1!: () => void;
      let resolve2!: () => void;

      const p1 = new Promise<void>((r) => { resolve1 = r; });
      const p2 = new Promise<void>((r) => { resolve2 = r; });

      const task1 = pool.execute(async () => {
        executionOrder.push(1);
        await p1;
        return "task1";
      });

      const task2 = pool.execute(async () => {
        executionOrder.push(2);
        await p2;
        return "task2";
      });

      // Both should be running (within limit of 2)
      await new Promise((r) => setTimeout(r, 10));
      expect(pool.getStatus().running).toBe(2);
      expect(executionOrder).toEqual([1, 2]);

      resolve1();
      resolve2();

      const [r1, r2] = await Promise.all([task1, task2]);
      expect(r1).toBe("task1");
      expect(r2).toBe("task2");
    });

    it("should queue tasks when at limit", async () => {
      let resolve1!: () => void;
      let resolve2!: () => void;

      const p1 = new Promise<void>((r) => { resolve1 = r; });
      const p2 = new Promise<void>((r) => { resolve2 = r; });

      // Fill the pool (max 2)
      const task1 = pool.execute(async () => { await p1; return "t1"; });
      const task2 = pool.execute(async () => { await p2; return "t2"; });

      // This should be queued
      let task3Started = false;
      const task3 = pool.execute(async () => { task3Started = true; return "t3"; });

      await new Promise((r) => setTimeout(r, 10));
      expect(pool.getStatus().running).toBe(2);
      expect(pool.getStatus().queued).toBe(1);
      expect(task3Started).toBe(false);

      // Complete task1 - task3 should start
      resolve1();
      await task1;
      await new Promise((r) => setTimeout(r, 10));

      expect(task3Started).toBe(true);
      expect(pool.getStatus().queued).toBe(0);

      resolve2();
      await Promise.all([task2, task3]);
    });

    it("should propagate errors from tasks", async () => {
      const result = pool.execute(async () => {
        throw new Error("Task failed");
      });

      await expect(result).rejects.toThrow("Task failed");
    });

    it("should continue processing queue after error", async () => {
      let resolve1!: () => void;
      const p1 = new Promise<void>((r) => { resolve1 = r; });

      // Fill pool with a failing task and a blocking task
      const task1 = pool.execute(async () => { throw new Error("fail"); });
      const task2 = pool.execute(async () => { await p1; return "ok"; });

      // Queue a third task
      const task3 = pool.execute(async () => "queued-ok");

      // task1 fails, task3 should get picked up
      await expect(task1).rejects.toThrow("fail");

      const r3 = await task3;
      expect(r3).toBe("queued-ok");

      resolve1();
      const r2 = await task2;
      expect(r2).toBe("ok");
    });
  });

  describe("setPoolSize", () => {
    it("should update max concurrent", () => {
      pool.setPoolSize(10);
      expect(pool.getStatus().maxConcurrent).toBe(10);
    });

    it("should allow queued tasks to run when pool size increases", async () => {
      // Pool of 1
      const smallPool = new ProcessPool({ maxConcurrent: 1 });

      let resolve1!: () => void;
      const p1 = new Promise<void>((r) => { resolve1 = r; });

      // Fill the single slot
      const task1 = smallPool.execute(async () => { await p1; return "t1"; });

      // Queue another
      let task2Started = false;
      const task2 = smallPool.execute(async () => { task2Started = true; return "t2"; });

      await new Promise((r) => setTimeout(r, 10));
      expect(smallPool.getStatus().running).toBe(1);
      expect(smallPool.getStatus().queued).toBe(1);
      expect(task2Started).toBe(false);

      // Increase pool size - should process queue
      smallPool.setPoolSize(2);
      await new Promise((r) => setTimeout(r, 10));

      expect(task2Started).toBe(true);
      expect(smallPool.getStatus().queued).toBe(0);

      resolve1();
      await Promise.all([task1, task2]);
    });

    it("should not crash when reducing pool size", () => {
      pool.setPoolSize(1);
      expect(pool.getStatus().maxConcurrent).toBe(1);
    });
  });

  describe("getStatus", () => {
    it("should report correct status after tasks complete", async () => {
      await pool.execute(async () => "done");

      const status = pool.getStatus();
      expect(status.running).toBe(0);
      expect(status.queued).toBe(0);
    });
  });
});
