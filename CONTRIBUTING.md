# Contributing to Better-OpenCodeMCP

Thanks for your interest in contributing! This project is actively maintained and we welcome PRs of all sizes.

## Getting Started

```bash
git clone https://github.com/ajhcs/Better-OpenCodeMCP.git
cd Better-OpenCodeMCP
npm install
npm run build
npm test          # 293 tests, all should pass
```

## Finding Work

- Check [issues labeled `good first issue`](https://github.com/ajhcs/Better-OpenCodeMCP/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for accessible entry points
- Check [issues labeled `help wanted`](https://github.com/ajhcs/Better-OpenCodeMCP/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) for bigger items
- Have an idea? Open an issue first so we can discuss the approach

## Development Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run build` — must compile cleanly
4. Run `npm test` — all 293+ tests must pass
5. Run `npm run lint` — no type errors
6. Open a PR against `main`

## Code Style

- TypeScript strict mode
- Zod schemas for all tool input validation
- Tests colocated in `src/__tests__/` (Vitest)
- Keep dependencies minimal — justify new additions

## Architecture Quick Reference

```
src/
├── index.ts              # MCP server entry, CLI args, transport
├── tools/                # MCP tool implementations (one file per tool)
│   └── registry.ts       # Zod-based tool registration system
├── tasks/                # Async task lifecycle management
├── persistence/          # File-based crash recovery
├── config/               # Model resolution chain
└── utils/                # Logger, process pool, event parsing
```

**Key patterns:**
- Tools use the registry pattern (`UnifiedTool` interface + Zod schema)
- Task state machine: `working → input_required → completed/failed/cancelled`
- Singletons for TaskManager and TaskPersistence
- Process pool limits concurrent OpenCode child processes

## Adding a New Tool

1. Create `src/tools/your-tool.tool.ts` (see `test-tool.example.ts` for template)
2. Define a Zod schema for input validation
3. Implement the `UnifiedTool` interface
4. Export from `src/tools/index.ts`
5. Add tests in `src/__tests__/yourTool.test.ts`

## Questions?

Open an issue or start a discussion — happy to help you get oriented.
