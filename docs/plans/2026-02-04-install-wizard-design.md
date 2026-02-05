# Install Wizard & Auto-Detect Model Configuration

**Date:** 2026-02-04
**Status:** Approved

## Problem

The MCP server requires `--model` flag, which is awkward for users. They must know the exact model format and specify it every time. OpenCode already has model preferences stored locally.

## Solution

Make `--model` optional with auto-detection and an interactive setup wizard.

## Model Resolution Chain

When the MCP server starts, it resolves the model in this order:

1. **CLI flag** - `--model` if explicitly provided
2. **Config file** - `~/.config/opencode-mcp/config.json` if exists
3. **Auto-detect** - Read `~/.local/state/opencode/model.json` → use most recent model
4. **Interactive prompt** - If all above fail and stdin is a TTY, launch wizard
5. **Error** - If not interactive (e.g., spawned by MCP client), exit with helpful error message

The fallback model follows the same chain but is optional at every step.

### Cross-Platform Paths

| Platform | Config File | OpenCode State |
|----------|-------------|----------------|
| Windows | `%LOCALAPPDATA%\opencode-mcp\config.json` | `%LOCALAPPDATA%\opencode\model.json` |
| Unix | `~/.config/opencode-mcp/config.json` | `~/.local/state/opencode/model.json` |

## Wizard UX

**Invocation:**
- Explicit: `opencode-mcp --setup` (can re-run anytime to reconfigure)
- Automatic: When model can't be resolved and running interactively

**Flow:**
```
$ opencode-mcp --setup

🔧 OpenCode MCP Setup

Fetching available models from OpenCode...

? Select your primary model:
  ❯ google/gemini-2.5-pro
    anthropic/claude-sonnet-4
    openai/gpt-4o
    deepseek/deepseek-chat
    (show all 47 models...)

? Select a fallback model (optional):
  ❯ (none)
    google/gemini-2.0-flash
    deepseek/deepseek-chat
    ...

? Default agent mode:
  ❯ build (immediate execution)
    plan (structured analysis)
    explore (investigation)

✅ Config saved to ~/.config/opencode-mcp/config.json

You can now use: opencode-mcp
Or reconfigure anytime with: opencode-mcp --setup
```

**Model list source:** Live from `opencode models` command (always up-to-date)

## Config File Structure

**Location:** `~/.config/opencode-mcp/config.json` (Unix) / `%LOCALAPPDATA%\opencode-mcp\config.json` (Windows)

```json
{
  "model": "zai-coding-plan/glm-4.7",
  "fallbackModel": "deepseek/deepseek-chat",
  "defaults": {
    "agent": "build"
  }
}
```

**Design notes:**
- `defaults` object is extensible for future settings
- All fields optional except `model` when file exists
- Model format matches OpenCode CLI: `provider/model`

## Auto-Detect Logic

OpenCode stores recent models in `model.json`:
```json
{
  "recent": [
    {"providerID": "zai-coding-plan", "modelID": "glm-4.7"},
    ...
  ]
}
```

Auto-detect combines: `${providerID}/${modelID}` → `zai-coding-plan/glm-4.7`

## Error Handling

**OpenCode not installed:**
```
❌ OpenCode CLI not found. Please install it first:
   npm install -g opencode
```

**No model resolved (non-interactive):**
```
❌ No model configured. Run setup first:
   opencode-mcp --setup

Or specify directly:
   opencode-mcp --model google/gemini-2.5-pro
```

**`opencode models` fails during wizard:**
```
⚠️  Could not fetch models from OpenCode.
    Enter model manually (format: provider/model): █
```

**Config file corrupted:** Log warning, ignore file, continue with auto-detect chain.

## File Structure

```
src/
├── config/
│   ├── paths.ts        # Cross-platform path resolution
│   ├── loader.ts       # Config file read/write
│   └── autoDetect.ts   # Read OpenCode's model.json
├── commands/
│   └── setup.ts        # Interactive wizard
└── index.ts            # Updated CLI parsing
```

## Dependencies

**New:** `@inquirer/prompts` (modern ESM-native prompts library)

## Implementation Tasks

1. Add `@inquirer/prompts` dependency
2. Create `src/config/paths.ts` - cross-platform path resolution
3. Create `src/config/autoDetect.ts` - read OpenCode's model.json
4. Create `src/config/loader.ts` - read/write config file
5. Create `src/commands/setup.ts` - interactive wizard
6. Update `src/index.ts` - optional model, resolution chain, --setup flag
7. Update README with new usage instructions
