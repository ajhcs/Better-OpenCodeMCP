/**
 * OpenCode Health Tool - Check system health and status.
 * Reports CLI availability, config, pool status, and task counts.
 * @module opencode-health.tool
 */

import { z } from "zod";
import { execSync } from "node:child_process";
import { UnifiedTool } from "./registry.js";
import { getTaskManager } from "../tasks/sharedTaskManager.js";
import { getActiveProcessCount } from "./opencode.tool.js";
import { getActiveRespondProcessCount } from "./opencode-respond.tool.js";
import { openCodeProcessPool } from "../utils/processPool.js";
import { getServerConfig } from "../config.js";
import { Logger } from "../utils/logger.js";

// ============================================================================
// Schema
// ============================================================================

const opencodeHealthArgsSchema = z.object({});

// ============================================================================
// Types
// ============================================================================

export interface HealthStatus {
  cli: {
    available: boolean;
    version?: string;
    error?: string;
  };
  config: {
    primaryModel: string;
    fallbackModel?: string;
    defaultAgent?: string;
  };
  pool: {
    running: number;
    queued: number;
    maxConcurrent: number;
  };
  tasks: {
    active: number;
    total: number;
    activeProcesses: number;
    activeRespondProcesses: number;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

export const opencodeHealthTool: UnifiedTool = {
  name: "opencode_health",
  description: `Check the health and status of the OpenCode MCP server.

USE THIS TOOL when:
- You want to verify the OpenCode CLI is available and working
- You need to check the current configuration
- You want to see the process pool and task status
- Something seems wrong and you want to diagnose

INPUTS: None required

RETURNS: Health status including CLI availability, config, pool status, and task counts`,
  zodSchema: opencodeHealthArgsSchema,
  category: "opencode",

  execute: async (): Promise<string> => {
    const taskManager = getTaskManager();
    const config = getServerConfig();
    const poolStatus = openCodeProcessPool.getStatus();

    // Check CLI availability
    let cliAvailable = false;
    let cliVersion: string | undefined;
    let cliError: string | undefined;

    try {
      const output = execSync("opencode --version", {
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
      });
      cliAvailable = true;
      cliVersion = output.trim();
    } catch (error) {
      cliError = error instanceof Error ? error.message : String(error);
      Logger.debug(`OpenCode CLI check failed: ${cliError}`);
    }

    const allTasks = taskManager.listAllTasks();
    const activeTasks = taskManager.listActiveTasks();

    const health: HealthStatus = {
      cli: {
        available: cliAvailable,
        ...(cliVersion && { version: cliVersion }),
        ...(cliError && { error: cliError }),
      },
      config: {
        primaryModel: config.primaryModel,
        ...(config.fallbackModel && { fallbackModel: config.fallbackModel }),
        ...(config.defaultAgent && { defaultAgent: config.defaultAgent }),
      },
      pool: poolStatus,
      tasks: {
        active: activeTasks.length,
        total: allTasks.length,
        activeProcesses: getActiveProcessCount(),
        activeRespondProcesses: getActiveRespondProcessCount(),
      },
    };

    return JSON.stringify(health, null, 2);
  },
};
