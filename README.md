
# OpenCode MCP Tool

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/frap129/opencode-mcp-tool?logo=github&label=GitHub)](https://github.com/frap129/opencode-mcp-tool/releases)
[![npm version](https://img.shields.io/npm/v/opencode-mcp-tool)](https://www.npmjs.com/package/opencode-mcp-tool)
[![npm downloads](https://img.shields.io/npm/dt/opencode-mcp-tool)](https://www.npmjs.com/package/opencode-mcp-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://img.shields.io/badge/Open%20Source-❤️-red.svg)](https://github.com/frap129/opencode-mcp-tool)

</div>

> 📚 **[View Full Documentation](https://frap129.github.io/opencode-mcp-tool/)** - Examples, FAQ, Troubleshooting, Best Practices

This is a Model Context Protocol (MCP) server that allows AI assistants to interact with the [OpenCode CLI](https://github.com/fictiverse/opencode). It enables AI assistants to leverage multiple AI models through a unified interface, with features like plan mode for structured thinking and extensive model selection.

- Ask questions through multiple AI models via Claude or other MCP clients
- Use plan mode for structured analysis and safer operations

## TLDR: [![Claude](https://img.shields.io/badge/Claude-D97757?logo=claude&logoColor=fff)](#) + Multiple AI Models via OpenCode

**Goal**: Use OpenCode's multi-model capabilities directly in Claude Code with flexible model selection and plan mode features.

## Prerequisites

Before using this tool, ensure you have:

1. **[Node.js](https://nodejs.org/)** (v16.0.0 or higher)
2. **[OpenCode CLI](https://github.com/fictiverse/opencode)** installed and configured

### One-Line Setup

```bash
claude mcp add opencode -- npx -y opencode-mcp-tool -- --model google/gemini-2.5-pro
```

### Verify Installation

Type `/mcp` inside Claude Code to verify the opencode-cli MCP is active.

---

### Alternative: Import from Claude Desktop

If you already have it configured in Claude Desktop:

1. Add to your Claude Desktop config:
```json
"opencode": {
  "command": "npx",
  "args": ["-y", "opencode-mcp-tool", "--", "--model", "google/gemini-2.5-pro"]
}
```

2. Import to Claude Code:
```bash
claude mcp add-from-claude-desktop
```

## Configuration

Register the MCP server with your MCP client. **Note: The server requires a primary model to be specified.**

### For NPX Usage (Recommended)

Add this configuration to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "opencode": {
      "command": "npx",
      "args": ["-y", "opencode-mcp-tool", "--", "--model", "google/gemini-2.5-pro", "--fallback-model", "google/gemini-2.5-flash"]
    }
  }
}
```

### For Global Installation

If you installed globally, use this configuration instead:

```json
{
  "mcpServers": {
    "opencode": {
      "command": "opencode-mcp",
      "args": ["--model", "google/gemini-2.5-pro", "--fallback-model", "google/gemini-2.5-flash"]
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

## Example Workflow

- **Natural language**: "use opencode to explain index.html", "understand the massive project using opencode", "ask opencode to search for latest news"
- **Claude Code**: Type `/opencode` and commands will populate in Claude Code's interface.

## Usage Examples

### With File References (using @ syntax)

- `ask opencode to analyze @src/main.js and explain what it does`
- `use opencode to summarize @. the current directory`
- `analyze @package.json and tell me about dependencies`

### General Questions (without files)

- `ask opencode to search for the latest tech news`
- `use opencode to explain div centering`
- `ask opencode about best practices for React development related to @file_im_confused_about`

### Using OpenCode's Plan Mode

The plan mode allows you to safely test code changes, run scripts, or execute potentially risky operations with structured planning.

- `use opencode plan mode to create and run a Python script that processes data`
- `ask opencode to safely test @script.py and explain what it does`
- `use opencode plan mode to install numpy and create a data visualization`
- `test this code safely: Create a script that makes HTTP requests to an API`

### Tools (for the AI)

These tools are designed to be used by the AI assistant.

- **`ask-opencode`**: Execute OpenCode with model selection and mode control. Uses plan mode by default for structured analysis.
  - **`prompt`** (required): The analysis request. Use the `@` syntax to include file or directory references (e.g., `@src/main.js explain this code`) or ask general questions (e.g., `Please use a web search to find the latest news stories`).
  - **`model`** (optional): The model to use. If not specified, uses the primary model configured at server startup.
  - **`mode`** (optional): Execution mode - 'plan' for structured analysis (default), 'build' for immediate execution, or custom mode string.
- **`brainstorm`**: Generate novel ideas with dynamic context gathering using creative frameworks (SCAMPER, Design Thinking, etc.), domain context integration, idea clustering, feasibility analysis, and iterative refinement.
  - **`prompt`** (required): Primary brainstorming challenge or question to explore.
  - **`methodology`** (optional): Brainstorming framework - 'divergent', 'convergent', 'scamper', 'design-thinking', 'lateral', or 'auto' (default).
  - **`domain`** (optional): Domain context (e.g., 'software', 'business', 'creative', 'research').
  - **`ideaCount`** (optional): Target number of ideas to generate (default: 12).
  - **`includeAnalysis`** (optional): Include feasibility and impact analysis (default: true).
- **`timeout-test`**: Test timeout prevention by running for a specified duration.
  - **`duration`** (required): Duration in milliseconds for the test.
- **`ping`**: Echo test tool that returns a message.
  - **`prompt`** (optional): Message to echo back.
- **`Help`**: Shows the OpenCode CLI help text.

### Slash Commands (for the User)

You can use these commands directly in Claude Code's interface (compatibility with other clients has not been tested).

- **/plan**: Execute OpenCode in plan mode for structured analysis and safer operations.
  - **`prompt`** (required): Analysis request (e.g., `/plan prompt:Create and run a Python script that processes CSV data` or `/plan prompt:@script.py Analyze this script safely`).
- **/build**: Execute OpenCode in immediate execution mode for direct implementation.
  - **`prompt`** (required): Implementation request for immediate code execution.
- **/help**: Displays the OpenCode CLI help information.
- **/ping**: Tests the connection to the server.
  - **`prompt`** (optional): A message to echo back.

## Contributing

Contributions are welcome! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and contribute to the project.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

**Disclaimer:** This is an unofficial, third-party tool and is not affiliated with, endorsed, or sponsored by Google.
