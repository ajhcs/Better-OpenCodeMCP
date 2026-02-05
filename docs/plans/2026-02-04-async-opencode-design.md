# Better-OpenCodeMCP Async Design

**Date:** 2026-02-04
**Status:** Approved

## Overview

Transform Better-OpenCodeMCP from a synchronous tool into an async subagent system where Claude (Opus) orchestrates and delegates to OpenCode running cheaper models (GLM 4.7, MiniMax 2.1).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude (Orchestrator)                    │
│  - Decides what to delegate                                  │
│  - Monitors task progress                                    │
│  - Responds to questions                                     │
│  - Processes results                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Better-OpenCodeMCP Server                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Task Manager │  │ JSON Parser  │  │ Session Manager   │  │
│  │ (MCP Tasks)  │  │ (Events)     │  │ (OpenCode)        │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   OpenCode (Executor)                        │
│  - Runs with --format json for structured output             │
│  - Uses --session for continuations                          │
│  - Emits events: step_start, text, tool_use, step_finish    │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **MCP Tasks Primitive** - Use native MCP Tasks (Nov 2025 spec) for async lifecycle
2. **OpenCode JSON Output** - Use `--format json` for precise state detection
3. **Session Continuations** - Use `--session <id>` for follow-up input
4. **File Persistence** - Crash recovery via file-based state

## Tools

### Primary: `opencode`

Starts async task, returns immediately.

```typescript
{
  name: "opencode",
  description: "Delegate a task to OpenCode for autonomous execution...",
  inputSchema: {
    task: string,
    agent?: "explore" | "plan" | "build",
    outputGuidance?: string,
    model?: string,
    sessionTitle?: string
  },
  outputSchema: {
    taskId: string,
    sessionId: string,
    status: "working"
  }
}
```

### `opencode_respond`

Send input when task waiting.

```typescript
{
  name: "opencode_respond",
  inputSchema: {
    taskId: string,
    response: string
  }
}
```

### `opencode_sessions`

List all active/recent sessions.

### `ping`

Health check (existing).

## OpenCode Event → MCP Task State Mapping

| OpenCode Event | step_finish.reason | MCP Task Status |
|----------------|-------------------|-----------------|
| `step_start` | - | working |
| `text`, `tool_use` | - | working |
| `step_finish` | "tool-calls" | working |
| `step_finish` | "stop" | completed |
| text ends "?" + timeout | - | input_required |
| process error | - | failed |
| cancelled | - | cancelled |

## Event Types (Verified)

```typescript
interface StepStartEvent {
  type: "step_start";
  timestamp: number;
  sessionID: string;
  part: { id: string; type: "step-start"; snapshot: string; };
}

interface TextEvent {
  type: "text";
  timestamp: number;
  sessionID: string;
  part: { id: string; type: "text"; text: string; time: { start: number; end: number; }; };
}

interface ToolUseEvent {
  type: "tool_use";
  timestamp: number;
  sessionID: string;
  part: {
    id: string;
    type: "tool";
    tool: string;
    callID: string;
    state: {
      status: "completed";
      input: Record<string, unknown>;
      output: string;
      metadata: { exit?: number; truncated: boolean; };
    };
  };
}

interface StepFinishEvent {
  type: "step_finish";
  timestamp: number;
  sessionID: string;
  part: {
    id: string;
    type: "step-finish";
    reason: "stop" | "tool-calls";
    tokens: { input: number; output: number; reasoning: number; };
    cost: number;
  };
}
```

## Persistence

```
~/.opencode-mcp/
├── tasks/
│   ├── {taskId}.json         # Task metadata
│   ├── {taskId}.output.jsonl # Raw OpenCode events
│   └── {taskId}.result.json  # Final result
├── sessions.json              # Session → Task mapping
└── config.json
```

## Implementation Order

1. **Better-OpenCodeMCP-yax** - Upgrade MCP SDK (P0, no deps)
2. **Better-OpenCodeMCP-s0b** - JSON event parser (P1, no deps)
3. **Better-OpenCodeMCP-2qy** - TaskManager (P1, deps: yax, s0b)
4. **Better-OpenCodeMCP-2q8** - opencode tool (P1, deps: s0b, 2qy)
5. **Better-OpenCodeMCP-ze6** - File persistence (P2, deps: 2qy)
6. **Better-OpenCodeMCP-dmo** - opencode_respond (P2, deps: 2q8)
7. **Better-OpenCodeMCP-us0** - opencode_sessions (P3, deps: 2qy)
8. **Better-OpenCodeMCP-9kj** - Remove old tools (P3, deps: 2q8, dmo, us0)
9. **Better-OpenCodeMCP-nu0** - Tests (P2, deps: 2q8, dmo)
10. **Better-OpenCodeMCP-09o** - Tool descriptions (P2, deps: 2q8, dmo, us0)

## Parallelization

Can run in parallel:
- **Phase 1:** yax + s0b (no dependencies)
- **Phase 2:** 2qy (after phase 1)
- **Phase 3:** 2q8 + ze6 (after phase 2)
- **Phase 4:** dmo + us0 + nu0 + 09o (after phase 3)
- **Phase 5:** 9kj (cleanup, after all tools working)
