# Commands Reference

Complete list of available commands and their usage.

## Slash Commands

### `/opencode:analyze`
Analyze files or ask questions about code.

```
/opencode:analyze @file.js explain this code
/opencode:analyze @src/*.ts find security issues
/opencode:analyze how do I implement authentication?
```

### `/opencode:plan`
Execute code analysis in plan mode for structured thinking.

```
/opencode:plan create a Python fibonacci generator
/opencode:plan test this function: [code]
```

### `/opencode:help`
Show help information and available tools.

```
/opencode:help
/opencode:help analyze
```

### `/opencode:ping`
Test connectivity with OpenCode.

```
/opencode:ping
/opencode:ping "Custom message"
```

## Command Structure

```
/opencode:<tool> [options] <arguments>
```

- **tool**: The action to perform (analyze, plan, help, ping)
- **options**: Optional flags (coming soon)
- **arguments**: Input text, files, or questions

## Natural Language Alternative

Instead of slash commands, you can use natural language:

- "Use opencode to analyze index.js"
- "Ask opencode to create a test file"
- "Have opencode explain this error"

## File Patterns

### Single File
```
@README.md
@src/index.js
@test/unit.test.ts
```

### Multiple Files
```
@file1.js @file2.js @file3.js
```

### Wildcards
```
@*.json           # All JSON files in current directory
@src/*.js         # All JS files in src
@**/*.test.js     # All test files recursively
```

### Directory
```
@src/             # All files in src
@test/unit/       # All files in test/unit
```

## Advanced Usage

### Combining Files and Questions
```
/opencode:analyze @package.json @src/index.js is the entry point configured correctly?
```

### Complex Queries
```
/opencode:analyze @src/**/*.js @test/**/*.test.js what's the test coverage?
```

### Code Generation
```
/opencode:analyze @models/user.js generate TypeScript types for this model
```

## Tips

1. **Start Simple**: Begin with single files before using patterns
2. **Be Specific**: Clear questions get better answers
3. **Use Context**: Include relevant files for better analysis
4. **Iterate**: Refine your queries based on responses