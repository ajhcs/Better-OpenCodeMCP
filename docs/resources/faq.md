# Frequently Asked Questions

## General

### What is OpenCode MCP Tool?
A bridge between Claude Desktop and Google's Gemini AI, enabling you to use Gemini's powerful capabilities directly within Claude.

### Does it support windows?
Windows testing is underway, some users have reported success and other failures.

### Why use this instead of OpenCode directly?
- Integrated into your existing AI workflow
- File analysis with @ syntax
- Reduced context switching (opencode can store and recall memories!)
- Best of both: Leverages both AIs' strengths

### Is it free?
The tool is open source and free. You need:
- OpenCode API key (has free tier) or Google Account
- Claude Desktop or Claude Code or any MCP client

## Setup

### Do I need to install OpenCode CLI separately?
Yes, install it with:
```bash
npm install -g @google/opencode
```
Then, run "opencode" and complete auth.

### Can I use this with Claude Code?
Yes! It works with both Claude Desktop and Claude Code.

### What Node.js version do I need?
Node.js v16.0.0 or higher.

## Usage

### What's the @ syntax?
It's how you reference files for analysis:
- `@file.js` - Single file
- `@src/*.js` - Multiple files
- `@**/*.ts` - All TypeScript files
- *new:* `file:index.html` now works, fully bypassing @ integration

### Can I analyze multiple files? What about ALL the files?
Yes! OpenCode's 1M token context allows analyzing entire codebases.

### Which model should I use?
- **Daily work**: gemini-2.5-pro
- **Large analysis**: gemini-2.5-pro
- **Quick tasks**: gemini-2.5-flash

## Features

### What languages are supported?
Any language code or human.

### Does it work offline?
No, it requires internet to connect to OpenCode API.

## Troubleshooting

### Why is it slow?
- Large files take time to process
- Try using Flash model for speed
- Check your internet connection

### Can I use my own models?
Currently supports official OpenCode models only.<br>
*--> opencode integration coming soon*

### Can I add new features?
Yes! Check issues or propose your own ideas.

## Privacy & Security

### Is my code sent to Google?
Only when you explicitly use OpenCode commands. Code is processed according to Google's privacy policy.

### Are credentials secure?
- We never look at or touch your keys!

### Can I use this for proprietary code?
Check your organization's policies and Google's API terms of service.

## Advanced

### Can I use this in CI/CD?
Not recommended - designed for interactive development.

<div style="text-align: center;">

## Why OpenCode MCP?

</div>

By bridging Claude Desktop with Google's powerful models, OpenCode MCP Tool lets you leverage the following advanced capabilities right in your existing workflow:

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin: 24px 0;">
  <div style="background: var(--vp-c-bg-soft); padding: 16px; border-radius: 8px; border: 1px solid var(--vp-c-divider);">
    <h4 style="margin: 0 0 8px 0; color: var(--vp-c-brand);">💰 Cost-Effective</h4>
    <p style="margin: 0; font-size: 14px; line-height: 1.5;">Delegate tasks to a more cost-effective model to reduce expensive token usage.</p>
  </div>
  
  <div style="background: var(--vp-c-bg-soft); padding: 16px; border-radius: 8px; border: 1px solid var(--vp-c-divider);">
    <h4 style="margin: 0 0 8px 0; color: var(--vp-c-brand);">🎯 Multimodal Native</h4>
    <p style="margin: 0; font-size: 14px; line-height: 1.5;">Process text, images, audio, video, and code seamlessly within your workflow.</p>
  </div>
  
  <div style="background: var(--vp-c-bg-soft); padding: 16px; border-radius: 8px; border: 1px solid var(--vp-c-divider);">
    <h4 style="margin: 0 0 8px 0; color: var(--vp-c-brand);">🚀 High Performance</h4>
    <p style="margin: 0; font-size: 14px; line-height: 1.5;">Leverage a large context window and powerful built-in tools, including web search.</p>
  </div>
  
  <div style="background: var(--vp-c-bg-soft); padding: 16px; border-radius: 8px; border: 1px solid var(--vp-c-divider);">
    <h4 style="margin: 0 0 8px 0; color: var(--vp-c-brand);">🧠 Advanced Reasoning</h4>
    <p style="margin: 0; font-size: 14px; line-height: 1.5;">Gain a different analytical perspective for sophisticated analysis of complex information.</p>
  </div>
  
  <div style="background: var(--vp-c-bg-soft); padding: 16px; border-radius: 8px; border: 1px solid var(--vp-c-divider);">
    <h4 style="margin: 0 0 8px 0; color: var(--vp-c-brand);">🔒 Privacy First</h4>
    <p style="margin: 0; font-size: 14px; line-height: 1.5;">Open-source and telemetry-free. Committed to transparency and responsible AI.</p>
  </div>
</div>

## More Questions?

- Check [Documentation](/)
- Browse [GitHub Issues](https://github.com/frap129/opencode-mcp-tool/issues)
- Ask in [Discussions](https://github.com/frap129/opencode-mcp-tool/discussions)