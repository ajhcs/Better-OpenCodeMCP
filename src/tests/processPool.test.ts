import { describe, it, expect } from 'vitest';
import { ProcessPool } from '../utils/processPool.js';

describe('ProcessPool', () => {
  it('should limit concurrent executions', async () => {
    const pool = new ProcessPool({ maxConcurrent: 2 });
    const executionOrder: number[] = [];
    const startTimes: number[] = [];

    const createTask = (id: number, duration: number) => async () => {
      startTimes.push(Date.now());
      executionOrder.push(id);
      await new Promise(resolve => setTimeout(resolve, duration));
      return id;
    };

    // Start 4 tasks with pool limit of 2
    const start = Date.now();
    const results = await Promise.all([
      pool.execute(createTask(1, 100)),
      pool.execute(createTask(2, 100)),
      pool.execute(createTask(3, 100)),
      pool.execute(createTask(4, 100)),
    ]);

    // All should complete
    expect(results).toEqual([1, 2, 3, 4]);

    // First 2 tasks should start immediately, next 2 should be delayed
    // With 2 concurrent and 100ms each, total time should be ~200ms (2 batches)
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180); // At least 2 rounds of 100ms
    expect(elapsed).toBeLessThan(500); // But not too long
  });

  it('should handle errors without blocking queue', async () => {
    const pool = new ProcessPool({ maxConcurrent: 2 });

    const failingTask = async () => {
      throw new Error('Task failed');
    };

    const successTask = async () => {
      return 'success';
    };

    const results = await Promise.allSettled([
      pool.execute(failingTask),
      pool.execute(successTask),
      pool.execute(successTask),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('fulfilled');
  });

  it('should report correct status', async () => {
    const pool = new ProcessPool({ maxConcurrent: 2 });

    expect(pool.getStatus()).toEqual({
      running: 0,
      queued: 0,
      maxConcurrent: 2,
    });

    // Start a long-running task
    const taskPromise = pool.execute(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'done';
    });

    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 10));

    const status = pool.getStatus();
    expect(status.running).toBe(1);
    expect(status.queued).toBe(0);

    await taskPromise;
  });
});
