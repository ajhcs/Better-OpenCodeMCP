import { describe, it, expect } from 'vitest';
import { getToolDefinitions, toolExists, executeTool } from '../tools/index.js';

describe('Tool Registry', () => {
  it('should return tool definitions', () => {
    const tools = getToolDefinitions();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    // Check that each tool has required properties
    for (const tool of tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
    }
  });

  it('should have ping tool available', () => {
    expect(toolExists('ping')).toBe(true);
  });

  it('should have opencode async tools available', () => {
    expect(toolExists('opencode')).toBe(true);
    expect(toolExists('opencode_sessions')).toBe(true);
    expect(toolExists('opencode_respond')).toBe(true);
  });

  it('should return false for non-existent tools', () => {
    expect(toolExists('non-existent-tool')).toBe(false);
  });

  it('should return false for removed deprecated tools', () => {
    expect(toolExists('ask-opencode')).toBe(false);
    expect(toolExists('brainstorm')).toBe(false);
    expect(toolExists('opencode_plan')).toBe(false);
    expect(toolExists('opencode_build')).toBe(false);
  });

  it('should execute ping tool correctly', async () => {
    const result = await executeTool('ping', { prompt: 'test message' });
    expect(result).toBe('test message');
  });

  it('should handle missing prompt in ping tool', async () => {
    const result = await executeTool('ping', {});
    // Ping returns "Pong!" when no message provided
    expect(result).toBe('Pong!');
  });
});
