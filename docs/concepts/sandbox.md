# Sandbox Mode

Execute code safely in an isolated environment.

## What is Sandbox Mode?

Sandbox mode allows OpenCode to write and test code in a secure, isolated environment without affecting your system.

## Basic Usage

```
/opencode:sandbox create a Python script that sorts a list
```

## How It Works

1. **Request** → You ask for code to be created/tested
2. **Generation** → OpenCode writes the code
3. **Execution** → Code runs in isolated environment
4. **Results** → Output returned safely

## Use Cases

### Algorithm Testing
```
/opencode:sandbox implement and test quicksort in JavaScript
```

### Data Processing
```
/opencode:sandbox parse this CSV and show statistics: [data]
```

### Proof of Concepts
```
/opencode:sandbox create a working web scraper example
```

## Safety Features

- **Isolated Execution**: No access to your file system
- **Resource Limits**: CPU and memory constraints
- **Time Limits**: Prevents infinite loops
- **No Network**: Cannot make external requests

## Supported Languages

- Python
- JavaScript/Node.js
- Ruby
- Go
- Java
- C++
- More coming soon!

## Best Practices

### 1. Be Specific
```
// Good
create a function that validates email addresses with tests

// Vague
make something that checks emails
```

### 2. Include Test Cases
```
implement binary search with edge case handling and show test results
```

### 3. Iterative Development
```
// First iteration
create a basic REST API

// Refine
add authentication to the API

// Test
show example requests and responses
```

## Limitations

- No file system access
- No network requests
- Limited execution time (30s)
- Memory limit (512MB)

## Examples

### Testing Algorithms
```
/opencode:sandbox benchmark bubble sort vs quick sort with 1000 items
```

### Learning Code
```
/opencode:sandbox show me how promises work in JavaScript with examples
```

### Debugging
```
/opencode:sandbox why does this code fail: [paste code]
```