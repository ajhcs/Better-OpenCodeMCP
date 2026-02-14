/**
 * Cross-platform process kill utility.
 * Handles differences between Windows and Unix signal handling.
 * @module utils/processKill
 */

import { ChildProcess, execSync } from "node:child_process";
import { Logger } from "./logger.js";

/**
 * Kills a child process in a cross-platform manner.
 * On Windows, uses taskkill for reliable termination.
 * On Unix, sends SIGTERM followed by SIGKILL after a grace period.
 */
export function killProcess(proc: ChildProcess): void {
  if (!proc.pid || proc.killed) {
    return;
  }

  try {
    if (process.platform === "win32") {
      // On Windows, SIGTERM doesn't work reliably. Use taskkill.
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
      } catch {
        // Process may already be dead
      }
    } else {
      // Unix: send SIGTERM, then SIGKILL after grace period
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }
  } catch (error) {
    Logger.debug(`Failed to kill process ${proc.pid}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
