# Better OpenCode MCP

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/ajhcs/Better-OpenCodeMCP?logo=github&label=GitHub)](https://github.com/ajhcs/Better-OpenCodeMCP/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://img.shields.io/badge/Open%20Source-red.svg)](https://github.com/ajhcs/Better-OpenCodeMCP)
[![Tests](https://img.shields.io/badge/tests-238%20passing-brightgreen.svg)](https://github.com/ajhcs/Better-OpenCodeMCP)

</div>

> Actively maintained fork of [opencode-mcp-tool](https://github.com/frap129/opencode-mcp-tool) with async task execution, concurrency fixes, and comprehensive testing.

A Model Context Protocol (MCP) server that allows AI assistants to interact with the [OpenCode CLI](https://github.com/fictiverse/opencode). It enables AI assistants to leverage multiple AI models through a unified interface with **async task execution** for parallel processing and long-running operations.

## What's Different in This Fork

- **Install wizard** - Interactive setup with auto-detection from OpenCode's configured model
- **Async task architecture** - Non-blocking execution with immediate task IDs for background processing
- **Fixed concurrent execution** - Original had race conditions when multiple tool calls ran simultaneously
- **Process pooling** - Limits concurrent child processes to prevent resource exhaustion
- **Comprehensive test suite** - 238 tests covering core functionality, async operations, and concurrency

## TLDR: [![Claude](https://img.shields.io/badge/Claude-D97757?logo=claude&logoColor=fff)](#) + Multiple AI Models via OpenCode

**Goal**: Use OpenCode's multi-model capabilities directly in Claude Code with flexible model selection and async task execution.

## Prerequisites

Before using this tool, ensure you have:

1. **[Node.js](https://nodejs.org/)** (v16.0.0 or higher)
2. **[OpenCode CLI](https://github.com/fictiverse/opencode)** installed and configured

### Quick Setup (Recommended)

**Option 1: Interactive Setup Wizard**

```bash
# Clone and run setup
git clone https://github.com/ajhcs/Better-OpenCodeMCP.git
cd Better-OpenCodeMCP
npm install && npm run build
node dist/index.js --setup
```

The wizard will:
- Fetch available models from your OpenCode installation
- Let you pick primary and fallback models
- Configure default agent mode
- Save settings to `~/.config/opencode-mcp/config.json`

**Option 2: Auto-Detection**

If you've used OpenCode before, the server automatically detects your most recently used model. Just run without flags:

```bash
node dist/index.js
```

**Option 3: Explicit Model**

```bash
node dist/index.js --model google/gemini-2.5-pro
```

### Add to Claude Code

```bash
# After running --setup or with auto-detection
claude mcp add opencode -- node /path/to/Better-OpenCodeMCP/dist/index.js

# Or with explicit model
claude mcp add opencode -- node /path/to/Better-OpenCodeMCP/dist/index.js -- --model google/gemini-2.5-pro
```

### Verify Installation

Type `/mcp` inside Claude Code to verify the opencode MCP is active.

---

## Configuration

The server resolves the model in this order:

1. **CLI flag** - `--model` if explicitly provided
2. **Config file** - `~/.config/opencode-mcp/config.json` (created by `--setup`)
3. **Auto-detect** - Your most recently used model in OpenCode
4. **Interactive** - Launches wizard if running in a terminal
5. **Error** - Shows helpful setup instructions

### Config File Format

Created by `--setup` wizard at `~/.config/opencode-mcp/config.json`:

```json
{
  "model": "google/gemini-2.5-pro",
  "fallbackModel": "deepseek/deepseek-chat",
  "defaults": {
    "agent": "build"
  }
}
```

### MCP Client Configuration

For Claude Desktop, add to your config:

```json
{
  "mcpServers": {
    "opencode": {
      "command": "node",
      "args": ["/path/to/Better-OpenCodeMCP/dist/index.js"]
    }
  }
}
```

Or with explicit model:

```json
{
  "mcpServers": {
    "opencode": {
      "command": "node",
      "args": ["/path/to/Better-OpenCodeMCP/dist/index.js", "--model", "google/gemini-2.5-pro"]
    }
  }
}
```

**Configuration File Locations:**

- **Claude Desktop**:
  - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
  - **Linux**: `~/.config/claude/claude_desktop_config.json`

After updating the configuration, restart your terminal session.

## Async Task Workflow

This MCP server uses an **async task architecture** for non-blocking execution:

```
1. Start task      →  opencode         →  Returns taskId immediately
2. Monitor         →  opencode_sessions →  Check task status
3. If input needed →  opencode_respond  →  Send response to task
4. Task completes  →  Status: completed/failed
```

### Task Status Flow

```
working → input_required → working → completed
                ↓                        ↓
              (respond)              (or failed)
```

- **working**: Task is actively executing
- **input_required**: Task paused, waiting for input via `opencode_respond`
- **completed**: Task finished successfully
- **failed**: Task encountered an error

## Tools Reference

### `opencode` - Start Async Task

Delegate a task to OpenCode for autonomous execution. Returns immediately with a taskId while the task runs in background.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | Yes | The task/prompt to send to OpenCode |
| `agent` | string | No | Agent mode: `explore`, `plan`, or `build` |
| `model` | string | No | Override default model (e.g., `google/gemini-2.5-pro`) |
| `outputGuidance` | string | No | Instructions for output formatting |
| `sessionTitle` | string | No | Human-readable name for tracking |

**Returns**: `{ taskId, sessionId, status: "working" }`

**Agent Modes**:
- `explore` - Investigation and research
- `plan` - Structured analysis and planning
- `build` - Immediate execution and implementation

### `opencode_sessions` - Monitor Tasks

List and monitor OpenCode tasks. Essential for tracking async task progress.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | `active` (running only) or `all` (includes completed). Default: `active` |
| `limit` | number | No | Maximum sessions to return. Default: `10` |

**Returns**: `{ sessions: [...], total: number }`

Each session contains: `taskId`, `sessionId`, `title`, `status`, `model`, `agent`, `createdAt`, `lastEventAt`

### `opencode_respond` - Send Input to Task

Send a response to an OpenCode task waiting for input. Resumes task execution.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | The task ID to respond to |
| `response` | string | Yes | The response text to send |

**Returns**: `{ taskId, status: "working", message: "..." }`

**Prerequisites**:
- Task must be in `input_required` state
- Task must have a valid sessionId

### Utility Tools

- **`ping`**: Echo test - returns the provided message
- **`Help`**: Shows OpenCode CLI help information

## Usage Examples

### Starting an Async Task

```
"use opencode to analyze @src/main.js"
→ Returns taskId immediately
→ Monitor with opencode_sessions
```

### Monitoring Task Progress

```
"check my opencode tasks"
→ Lists all active tasks with status
```

### Responding to Input Requests

When a task shows `input_required`:
```
"respond to task abc123 with 'yes, proceed with the refactoring'"
```

### Example Workflow

1. **Start**: "use opencode to refactor @utils.ts for better error handling"
2. **Check**: "what's the status of my opencode tasks?"
3. **Respond**: (if input needed) "respond with 'use try-catch blocks'"
4. **Complete**: Task finishes with results

### With File References (using @ syntax)

- `use opencode to analyze @src/main.js and explain what it does`
- `use opencode to summarize @. the current directory`
- `analyze @package.json using opencode`

### General Questions

- `ask opencode to search for the latest tech news`
- `use opencode to explain div centering`
- `ask opencode about best practices for React development`

### Using Agent Modes

- **Explore**: `use opencode in explore mode to investigate the authentication system`
- **Plan**: `use opencode in plan mode to design a caching strategy`
- **Build**: `use opencode in build mode to implement the login feature`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request at [github.com/ajhcs/Better-OpenCodeMCP](https://github.com/ajhcs/Better-OpenCodeMCP).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Based on [opencode-mcp-tool](https://github.com/frap129/opencode-mcp-tool) by frap129.

**Disclaimer:** This is an unofficial, third-party tool and is not affiliated with, endorsed, or sponsored by Google or Anthropic.
