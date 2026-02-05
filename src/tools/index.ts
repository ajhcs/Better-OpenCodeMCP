// Tool Registry Index - Registers all tools
import { toolRegistry } from './registry.js';
import { pingTool, helpTool } from './simple-tools.js';
import { opencodeTool } from './opencode.tool.js';
import { opencodeSessionsTool } from './opencode-sessions.tool.js';
import { opencodeRespondTool } from './opencode-respond.tool.js';

toolRegistry.push(
  // Async OpenCode tools
  opencodeTool,
  opencodeSessionsTool,
  opencodeRespondTool,
  // Simple utility tools
  pingTool,
  helpTool
);

export * from './registry.js';