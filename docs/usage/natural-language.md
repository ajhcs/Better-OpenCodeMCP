# Natural Language Usage

You don't need to memorize commands - just ask naturally!

## How It Works

Claude Code understands when you want to use OpenCode and automatically routes your request.

## Examples

### File Analysis
Instead of: `/opencode:analyze @app.js explain`

Say:
- "Use opencode to explain app.js"
- "Ask opencode what this code does"
- "Have opencode analyze the main application file"

### Code Generation
Instead of: `/opencode:sandbox create a web server`

Say:
- "Get opencode to create a simple web server"
- "I need opencode to write a REST API example"
- "Can opencode show me how to build an Express server?"

### Debugging
Instead of: `/opencode:analyze @error.log @app.js debug`

Say:
- "Help me debug this error using opencode"
- "OpenCode, why is my app crashing?"
- "Use opencode to find the bug in my code"

## Keywords That Trigger OpenCode

Claude recognizes these patterns:
- "use opencode..."
- "ask opencode..."
- "opencode please..."
- "have opencode..."
- "get opencode to..."
- "with opencode..."

## Best Practices

### 1. Be Conversational
```
❌ /opencode:analyze @config.json validate

✅ "Hey, can opencode check if my config.json is valid?"
```

### 2. Provide Context
```
❌ "analyze the bug"

✅ "OpenCode, I'm getting a null pointer error in my auth handler, can you help?"
```

### 3. Specify Files Naturally
```
❌ @src/utils.js @src/helpers.js relationship

✅ "How do utils.js and helpers.js work together? Ask opencode."
```

## Common Patterns

### Code Review
- "OpenCode, review my latest changes"
- "Use opencode to check my pull request"
- "Is this code production-ready? Ask opencode"

### Learning
- "OpenCode, explain how React hooks work"
- "Can opencode show me Python best practices?"
- "I want to learn about async/await with opencode"

### Refactoring
- "OpenCode, how can I make this code cleaner?"
- "Use opencode to refactor this function"
- "Help me optimize this algorithm with opencode"

## Mixing Commands and Natural Language

You can combine both approaches:

```
"I need to debug this" → /opencode:analyze @app.js @error.log
```

Claude understands the context and uses the appropriate tool.

## Tips

1. **Just Ask**: Don't overthink the syntax
2. **Be Specific**: Include what you want to analyze
3. **Iterate**: Have a conversation with follow-up questions
4. **No Memorization**: Use whatever feels natural

Remember: The goal is to make AI assistance feel natural, not robotic!

