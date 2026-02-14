# Changelog

## [2.0.0] - 2026-02-14

### Security
- Add input length limits to all Zod schemas (task, model, response, session title, output guidance)
- Add model parameter format validation (supports nested providers like `lmstudio/google/gemma-3n-e4b`)

### Added
- `opencode_cancel` tool - cancel running tasks and kill associated processes
- `opencode_health` tool - system diagnostics (CLI availability, config, pool status, task counts)
- Graceful shutdown handlers (SIGINT/SIGTERM/SIGHUP) with process cleanup
- Cross-platform process kill utility (Windows `taskkill` support)
- 15-minute process timeout to prevent runaway processes
- Task persistence integration - events and results saved to `~/.opencode-mcp/`
- Periodic task purge (1hr retention for completed tasks)
- `--log-level` CLI option (debug, info, warn, error, silent)
- Configurable process pool size via config file (`pool.maxConcurrent`)
- `prepare` script for npm publish workflow

### Changed
- Logger rewritten with proper log-level filtering (default: `warn`)
- All logger `any` params replaced with `unknown`
- Generalized quota/rate-limit error detection (was Gemini-specific, now detects any provider)
- Process pool now uses configurable size from constants

### Fixed
- Windows task execution: add missing `run` subcommand required by OpenCode CLI
- Windows .cmd wrapper spawning: use `shell: true` for correct process execution
- Error event handling: model-not-found and similar errors now surface as task failures
- Auto-detect: OpenCode uses XDG paths on Windows, not `%LOCALAPPDATA%`
- Model regex: support nested providers (e.g., `lmstudio/google/gemma-3n-e4b`)
- Unbounded memory growth from accumulated task text (capped at 1MB)
- Stale command tracking entries in logger (purged after 30 minutes)
- Missing cleanup of process timeouts on shutdown

## [1.4.0]
- Interactive setup wizard with auto-detect model configuration
- Config file resolution chain: CLI flag → config file → auto-detect → wizard

## [1.3.0]
- Async task architecture with MCP Tasks primitive
- Shared singleton TaskManager
- NDJSON event streaming from OpenCode CLI
- `opencode_sessions` tool for monitoring task status
- `opencode_respond` tool for interactive sessions

## [1.2.0]
- Repository transfer and URL updates
- Race condition fix in concurrent tool execution
- Renamed `model` parameter to `agent`

## [1.1.3]
- Added `changeMode` parameter for structured edit responses
- Intelligent parsing and chunking for large edit responses
- Structured response format with Analysis, Suggested Changes, and Next Steps

## [1.1.2]
- Gemini-2.5-pro quota limit exceeded now falls back to gemini-2.5-flash

## [1.1.1]
- Initial public release
- Basic Gemini CLI integration
- Support for file analysis with @ syntax
- Sandbox mode support
