// Tool Registry Index - Registers all tools
import { toolRegistry } from './registry.js';
import { askOpenCodeTool } from './ask-opencode.tool.js';
import { pingTool, helpTool } from './simple-tools.js';
import { brainstormTool } from './brainstorm.tool.js';
import { timeoutTestTool } from './timeout-test.tool.js';
import { opencodePlanTool, opencodeBuildTool } from './slash-commands.tool.js';

toolRegistry.push(
  askOpenCodeTool,
  pingTool,
  helpTool,
  brainstormTool,
  timeoutTestTool,
  opencodePlanTool,
  opencodeBuildTool
);

export * from './registry.js';