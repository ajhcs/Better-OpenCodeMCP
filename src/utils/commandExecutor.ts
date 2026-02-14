import { spawn } from "child_process";
import { Logger } from "./logger.js";
import { openCodeProcessPool } from "./processPool.js";

/**
 * Execute a command with process pool limiting
 * Ensures no more than maxConcurrent processes run simultaneously
 */
export async function executeCommand(
  command: string,
  args: string[],
  onProgress?: (newOutput: string) => void
): Promise<string> {
  // Use process pool to limit concurrent executions
  return openCodeProcessPool.execute(() => executeCommandInternal(command, args, onProgress));
}

/**
 * Internal command execution (called by process pool)
 */
function executeCommandInternal(
  command: string,
  args: string[],
  onProgress?: (newOutput: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    Logger.commandExecution(command, args, startTime);

    const childProcess = spawn(command, args, {
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let isResolved = false;
    let lastReportedLength = 0;

    childProcess.stdout.on("data", (data) => {
      stdout += data.toString();

      // Report new content if callback provided
      if (onProgress && stdout.length > lastReportedLength) {
        const newContent = stdout.substring(lastReportedLength);
        lastReportedLength = stdout.length;
        onProgress(newContent);
      }
    });


    // CLI level errors - detect rate limiting / quota exhaustion
    childProcess.stderr.on("data", (data) => {
      stderr += data.toString();

      // General quota/rate limit detection patterns
      const quotaPatterns = [
        /RESOURCE_EXHAUSTED/i,
        /rate.?limit/i,
        /too many requests/i,
        /quota exceeded/i,
        /\b429\b/,
      ];

      const isQuotaError = quotaPatterns.some((p) => p.test(stderr));
      if (isQuotaError) {
        const modelMatch = stderr.match(/Quota exceeded for quota metric '([^']+)'/) ||
                           stderr.match(/model['":\s]+([a-zA-Z0-9._/-]+)/);
        const statusMatch = stderr.match(/status["\s]*[:=]\s*(\d+)/);
        const reasonMatch = stderr.match(/"reason":\s*"([^"]+)"/);
        const model = modelMatch ? modelMatch[1] : "Unknown Model";
        const status = statusMatch ? statusMatch[1] : "429";
        const reason = reasonMatch ? reasonMatch[1] : "rateLimitExceeded";
        Logger.error(`Quota/rate limit error: model=${model}, status=${status}, reason=${reason}`);
      }
    });
    childProcess.on("error", (error) => {
      if (!isResolved) {
        isResolved = true;
        Logger.error(`Process error:`, error);
        reject(new Error(`Failed to spawn command: ${error.message}`));
      }
    });
    childProcess.on("close", (code) => {
      if (!isResolved) {
        isResolved = true;
        if (code === 0) {
          Logger.commandComplete(startTime, code, stdout.length);
          resolve(stdout.trim());
        } else {
          Logger.commandComplete(startTime, code);
          Logger.error(`Failed with exit code ${code}`);
          const errorMessage = stderr.trim() || "Unknown error";
          reject(
            new Error(`Command failed with exit code ${code}: ${errorMessage}`),
          );
        }
      }
    });
  });
}