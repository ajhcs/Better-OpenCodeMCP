# File Analysis with @ Syntax

One of the most powerful features of OpenCode MCP Tool is the ability to analyze files using the `@` syntax.

## Basic Usage

```
/opencode:analyze @index.js explain this code
```
```
ask opencode to analyze the entire codebase and a comment block 
to the top of every script, explaining that script. Use flash.
```
```
Ask opencode to explain @index.js by reading the entire codebase first
```
```
Ask opencode to analyze @src/ and provide bug fixes
```
```
Ask opencode what the weather is like in new york
```
```
...then use opencode to review your recent modifications
```
## Multiple Files

Analyze multiple files in one request:
```
/opencode:analyze @src/server.js @src/client.js how do these interact?
```
```
analyze @src/server.js @src/client.js and provide bug fixes
```

## Entire Directories

Analyze whole directories:
```
/opencode:analyze @src/**/*.ts summarize the TypeScript architecture
```
```
analyze @main using opencode and determine the top 3 optimizations
```

## Why @ Syntax?

- **Familiar**: Both Claude and OpenCode natively support it
- **Explicit**: Clear which files are being analyzed
- **Flexible**: Works with single files, multiple files, or patterns

## Best Practices

### 1. Be Specific
```
// Good
@src/auth/login.js explain the authentication flow

// Too vague
@src explain everything
```

### 2. Use Patterns Wisely
```
// Analyze all test files
@**/*.test.js are all tests passing?

// Analyze specific module
@modules/payment/*.js review payment logic
```

### 3. Combine with Questions
```
@package.json @src/index.js is this properly configured?
```

### 4. Speak Naturally
```
What does opencode think about that?
```
```
ask opencode to get a second opinion
```

## Token Optimization

OpenCode's massive context window allows analyzing entire codebases, saving claude tokens.

## Examples

### Code Review
```
@feature/new-api.js review this PR changes
```

### Documentation
```
@src/utils/*.js generate JSDoc comments
```

### Debugging
```
@error.log @src/handler.js why is this error occurring?
```