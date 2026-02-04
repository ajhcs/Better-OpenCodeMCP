/**
 * Process pool to limit concurrent child processes
 * Prevents resource exhaustion when many parallel requests come in
 */

export interface ProcessPoolConfig {
  maxConcurrent: number;
}

interface QueuedTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class ProcessPool {
  private maxConcurrent: number;
  private running: number = 0;
  private queue: QueuedTask<any>[] = [];

  constructor(config: ProcessPoolConfig) {
    this.maxConcurrent = config.maxConcurrent;
  }

  /**
   * Execute a task with concurrency limiting
   * Tasks are queued if max concurrent limit is reached
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queuedTask: QueuedTask<T> = { execute: task, resolve, reject };

      if (this.running < this.maxConcurrent) {
        this.runTask(queuedTask);
      } else {
        this.queue.push(queuedTask);
      }
    });
  }

  private async runTask<T>(task: QueuedTask<T>): Promise<void> {
    this.running++;

    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        this.runTask(nextTask);
      }
    }
  }

  /**
   * Get current pool status
   */
  getStatus(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Default pool for opencode processes - limit to 5 concurrent
export const openCodeProcessPool = new ProcessPool({ maxConcurrent: 5 });
