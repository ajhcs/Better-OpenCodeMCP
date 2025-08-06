# Model Selection

Choose the right model for your task.

## Available Models

### gemini-2.5-pro
- **Best for**: Complex analysis, large codebases
- **Context**: 2M tokens
- **Use when**: Analyzing entire projects, architectural reviews, stronger reasoning

### gemini-2.5-flash
- **Best for**: Quick responses, routine tasks
- **Context**: 1M tokens  
- **Use when**: Fast code reviews, Analyzing entire projects, simple explanations

## Setting Models
```bash
You need use natural language: "...using gemini-2.5-flash"
```
```bash
You can also append with '-m' or ask specifically with 
```

### In Configuration
```json
{
  "mcpServers": {
    "opencode": {
      "command": "opencode-mcp",
      "env": {
        "OPENCODE_MODEL": "gemini-2.5-flash"
      }
    }
  }
}
```

### Per Request (Coming Soon)
```
/opencode:analyze --model=gemini-2.5-flash @file.js quick review
```

## Model Comparison

| Model | Speed | Context | Best Use Case |
|-------|-------|---------|---------------|
| gemini-2.5-pro | Slower | 2M tokens | big ideas |
| gemini-2.5-flash | Fast | 1M tokens | quick, specific changes |

## Cost Optimization

1. **Start with gemini-2.5-flash** for most tasks
2. **Use gemini-2.5-pro** only when you need the full context
3. **gemini-2.5-flash** for simple, repetitive tasks

## Token Limits

- **gemini-2.5-pro**: ~2 million tokens (~500k lines of code)
- **gemini-2.5-flash**: ~1 million tokens (~250k lines of code)

## Recommendations

- **Code Review**: gemini-2.5-flash
- **Architecture Analysis**: gemini-2.5-pro
- **Quick Fixes**: gemini-2.5-flash
- **Documentation**: gemini-2.5-flash
- **Security Audit**: gemini-2.5-pro