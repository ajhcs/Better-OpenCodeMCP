import { homedir } from 'os';
import { join } from 'path';

/**
 * Cross-platform path resolution for config and state files.
 */

/**
 * Get the config directory for opencode-mcp.
 * - Windows: %LOCALAPPDATA%\opencode-mcp
 * - Unix: ~/.config/opencode-mcp
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      return join(localAppData, 'opencode-mcp');
    }
    // Fallback for Windows without LOCALAPPDATA
    return join(homedir(), 'AppData', 'Local', 'opencode-mcp');
  }

  // Unix (Linux, macOS)
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return join(xdgConfig, 'opencode-mcp');
  }
  return join(homedir(), '.config', 'opencode-mcp');
}

/**
 * Get the full path to the opencode-mcp config file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Get the OpenCode state directory where model.json lives.
 * OpenCode uses XDG paths on ALL platforms (including Windows):
 * - XDG_STATE_HOME/opencode if set
 * - ~/.local/state/opencode otherwise
 *
 * Confirmed via `opencode debug paths` which shows:
 *   state: C:\Users\<user>\.local\state\opencode (Windows)
 *   state: ~/.local/state/opencode (Unix)
 */
export function getOpenCodeStateDir(): string {
  const xdgState = process.env.XDG_STATE_HOME;
  if (xdgState) {
    return join(xdgState, 'opencode');
  }
  return join(homedir(), '.local', 'state', 'opencode');
}

/**
 * Get the full path to OpenCode's model.json file.
 */
export function getOpenCodeModelPath(): string {
  return join(getOpenCodeStateDir(), 'model.json');
}

/**
 * Check if running in an interactive terminal (TTY).
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
