import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

describe('MCP Server Concurrency', () => {
  it('should handle multiple concurrent tool calls correctly', async () => {
    const server = spawn('node', [join(projectRoot, 'dist/index.js'), '-m', 'test-model'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectRoot,
    });

    const responses: any[] = [];

    const responsePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.kill();
        reject(new Error('Timeout waiting for responses'));
      }, 10000);

      server.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l: string) => l.startsWith('{'));
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.result) {
              responses.push(json);
              if (responses.length === 3) {
                clearTimeout(timeout);
                server.kill();
                resolve();
              }
            }
          } catch {
            // Not JSON, ignore
          }
        }
      });

      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Send 3 concurrent requests
    const requests = [
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{"prompt":"request-1"}}}',
      '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{"prompt":"request-2"}}}',
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ping","arguments":{"prompt":"request-3"}}}',
    ];

    for (const req of requests) {
      server.stdin.write(req + '\n');
    }

    await responsePromise;

    // Verify all responses are correct
    expect(responses.length).toBe(3);

    const texts = responses.map(r => r.result.content[0].text);
    expect(texts).toContain('request-1');
    expect(texts).toContain('request-2');
    expect(texts).toContain('request-3');
  }, 15000);
});
