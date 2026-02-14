

// Logging
export const LOG_PREFIX = "[OMCPT]";

// Error messages
export const ERROR_MESSAGES = {
  QUOTA_EXCEEDED: "quota exceeded",
  QUOTA_EXCEEDED_SHORT: "⚠️ Model quota exceeded. Switching to fallback model if available.",
  TOOL_NOT_FOUND: "not found in registry",
  NO_PROMPT_PROVIDED: "Please provide a prompt for analysis. Use @ syntax to include files (e.g., '@largefile.js explain what this does') or ask general questions",
} as const;

// Status messages
export const STATUS_MESSAGES = {
  QUOTA_SWITCHING: "🚫 Model quota exceeded, switching to fallback model...",
  FALLBACK_RETRY: "⚡ Retrying with fallback model...",
  FALLBACK_SUCCESS: "✅ Fallback model completed successfully",
  PLAN_MODE_EXECUTING: "📋 Executing OpenCode command in plan mode...",
  OPENCODE_RESPONSE: "OpenCode response:",
  // Timeout prevention messages
  PROCESSING_START: "🔍 Starting analysis (may take 5-15 minutes for large codebases)",
  PROCESSING_CONTINUE: "⏳ Still processing... OpenCode is working on your request",
  PROCESSING_COMPLETE: "✅ Analysis completed successfully",
} as const;

// MCP Protocol Constants
export const PROTOCOL = {
  // Message roles
  ROLES: {
    USER: "user",
    ASSISTANT: "assistant",
  },
  // Content types
  CONTENT_TYPES: {
    TEXT: "text",
  },
  // Status codes
  STATUS: {
    SUCCESS: "success",
    ERROR: "error",
    FAILED: "failed",
    REPORT: "report",
  },
  // Notification methods
  NOTIFICATIONS: {
    PROGRESS: "notifications/progress",
  },
  // Timeout prevention
  KEEPALIVE_INTERVAL: 25000, // 25 seconds
} as const;


// CLI Constants
export const CLI = {
  // Command names
  COMMANDS: {
    OPENCODE: "opencode",
    ECHO: "echo",
  },
  // Subcommands
  SUBCOMMANDS: {
    RUN: "run",
  },
  // Command flags
  FLAGS: {
    MODEL: "-m",
    AGENT: "--agent",
    HELP: "--help",
  },
  // Mode values
  MODES: {
    PLAN: "plan",
  },
  // Default values
  DEFAULTS: {
    BOOLEAN_TRUE: "true",
    BOOLEAN_FALSE: "false",
  },
} as const;


// Input validation limits
export const LIMITS = {
  MAX_TASK_LENGTH: 100_000,
  MAX_MODEL_LENGTH: 128,
  MAX_SESSION_TITLE_LENGTH: 256,
  MAX_OUTPUT_GUIDANCE_LENGTH: 10_000,
  MAX_RESPONSE_LENGTH: 50_000,
} as const;

// Process constants
export const PROCESS = {
  POOL_SIZE: 5,
  MAX_RUNTIME_MS: 15 * 60 * 1000, // 15 minutes
  MAX_ACCUMULATED_TEXT_BYTES: 1_048_576, // 1MB
  STALE_COMMAND_MS: 30 * 60 * 1000, // 30 minutes
  COMPLETED_TASK_MAX_AGE_MS: 60 * 60 * 1000, // 1 hour
  PURGE_INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
} as const;

// Log levels
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
} as const;

// Tool arguments interface
export interface ToolArguments {
  prompt?: string;
  model?: string;
  agent?: string; // Generic agent parameter (plan, build, or custom)
  message?: string; // For Ping tool

  [key: string]: string | boolean | number | undefined; // Allow additional properties
}
