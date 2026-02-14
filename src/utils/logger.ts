/**
 * Logger with configurable log-level filtering.
 * All output goes to stderr to avoid interfering with MCP stdio transport.
 * @module utils/logger
 */

import { LOG_PREFIX, LOG_LEVELS } from "../constants.js";
import type { LogLevel } from "../constants.js";

export class Logger {
  private static level: LogLevel = "warn";

  private static formatMessage(level: string, message: string): string {
    return `${LOG_PREFIX} [${level.toUpperCase()}] ${message}\n`;
  }

  private static shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  static setLevel(level: LogLevel): void {
    this.level = level;
  }

  static getLevel(): LogLevel {
    return this.level;
  }

  static log(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.warn(this.formatMessage("info", message), ...args);
    }
  }

  static info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.warn(this.formatMessage("info", message), ...args);
    }
  }

  static warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  static error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }

  static debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.warn(this.formatMessage("debug", message), ...args);
    }
  }

  static toolInvocation(toolName: string, args: unknown): void {
    if (this.shouldLog("debug")) {
      this.debug(`Tool invocation [${toolName}]: ${JSON.stringify(args, null, 2)}`);
    }
  }

  static toolParsedArgs(prompt: string, agent: string, model?: string): void {
    if (this.shouldLog("debug")) {
      this.debug(`Parsed prompt: "${prompt}"\nagent: ${agent}${model ? `\nmodel: ${model}` : ""}`);
    }
  }

  static commandExecution(command: string, args: string[], startTime: number): void {
    if (this.shouldLog("debug")) {
      this.debug(`[${startTime}] Starting: ${command} ${args.map((arg) => `"${arg}"`).join(" ")}`);
    }

    // Store command execution start for timing analysis
    this._commandStartTimes.set(startTime, { command, args, startTime });

    // Purge stale entries older than 30 minutes
    const staleThreshold = Date.now() - 30 * 60 * 1000;
    for (const [key] of this._commandStartTimes) {
      if (key < staleThreshold) {
        this._commandStartTimes.delete(key);
      }
    }
  }

  // Track command start times for duration calculation
  private static _commandStartTimes = new Map<number, { command: string; args: string[]; startTime: number }>();

  static commandComplete(startTime: number, exitCode: number | null, outputLength?: number): void {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (this.shouldLog("debug")) {
      this.debug(`[${elapsed}s] Process finished with exit code: ${exitCode}`);
      if (outputLength !== undefined) {
        this.debug(`Response: ${outputLength} chars`);
      }
    }

    // Clean up command tracking
    this._commandStartTimes.delete(startTime);
  }
}
