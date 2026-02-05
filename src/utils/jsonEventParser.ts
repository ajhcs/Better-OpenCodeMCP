/**
 * JSON Event Parser for OpenCode NDJSON streaming output.
 * Parses events from OpenCode CLI when using --format json flag.
 * @module jsonEventParser
 */

import { Logger } from "./logger.js";

// ============================================================================
// Event Part Interfaces
// ============================================================================

/**
 * Part data for step_start events.
 */
export interface StepStartPart {
  id: string;
  type: "step-start";
  snapshot: string;
}

/**
 * Part data for text events with timing information.
 */
export interface TextPart {
  id: string;
  type: "text";
  text: string;
  time: {
    start: number;
    end: number;
  };
}

/**
 * State information for tool execution.
 */
export interface ToolState {
  status: "completed" | "pending" | "error";
  input: Record<string, unknown>;
  output: string;
  metadata: {
    exit?: number;
    truncated: boolean;
  };
}

/**
 * Part data for tool_use events.
 */
export interface ToolUsePart {
  id: string;
  type: "tool";
  tool: string;
  callID: string;
  state: ToolState;
}

/**
 * Token usage information for a step.
 */
export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
}

/**
 * Part data for step_finish events.
 */
export interface StepFinishPart {
  id: string;
  type: "step-finish";
  reason: "stop" | "tool-calls";
  tokens: TokenUsage;
  cost: number;
}

// ============================================================================
// Event Interfaces
// ============================================================================

/**
 * Base interface for all OpenCode events.
 */
interface BaseEvent {
  type: string;
  timestamp: number;
  sessionID: string;
}

/**
 * Event emitted when a new step begins.
 * Contains a snapshot of the current state.
 */
export interface StepStartEvent extends BaseEvent {
  type: "step_start";
  part: StepStartPart;
}

/**
 * Event emitted when the model generates text output.
 * Includes timing information for the text generation.
 */
export interface TextEvent extends BaseEvent {
  type: "text";
  part: TextPart;
}

/**
 * Event emitted when a tool is used by the model.
 * Contains tool name, input, output, and execution metadata.
 */
export interface ToolUseEvent extends BaseEvent {
  type: "tool_use";
  part: ToolUsePart;
}

/**
 * Event emitted when a step finishes.
 * Contains token usage and cost information.
 * reason="stop" indicates final completion, "tool-calls" indicates more steps coming.
 */
export interface StepFinishEvent extends BaseEvent {
  type: "step_finish";
  part: StepFinishPart;
}

/**
 * Union type of all possible OpenCode events.
 * Use type guards or switch on the `type` field to narrow.
 */
export type OpenCodeEvent = StepStartEvent | TextEvent | ToolUseEvent | StepFinishEvent;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an event is a StepStartEvent.
 * @param event - The event to check
 * @returns True if the event is a StepStartEvent
 */
export function isStepStartEvent(event: OpenCodeEvent): event is StepStartEvent {
  return event.type === "step_start";
}

/**
 * Type guard to check if an event is a TextEvent.
 * @param event - The event to check
 * @returns True if the event is a TextEvent
 */
export function isTextEvent(event: OpenCodeEvent): event is TextEvent {
  return event.type === "text";
}

/**
 * Type guard to check if an event is a ToolUseEvent.
 * @param event - The event to check
 * @returns True if the event is a ToolUseEvent
 */
export function isToolUseEvent(event: OpenCodeEvent): event is ToolUseEvent {
  return event.type === "tool_use";
}

/**
 * Type guard to check if an event is a StepFinishEvent.
 * @param event - The event to check
 * @returns True if the event is a StepFinishEvent
 */
export function isStepFinishEvent(event: OpenCodeEvent): event is StepFinishEvent {
  return event.type === "step_finish";
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Known event types that we support parsing.
 */
const KNOWN_EVENT_TYPES = new Set(["step_start", "text", "tool_use", "step_finish"]);

/**
 * Parses a single line of NDJSON output from OpenCode.
 * Handles malformed JSON gracefully by returning null and logging a warning.
 *
 * @param line - A single line from the NDJSON stream
 * @returns The parsed OpenCodeEvent, or null if parsing fails or line is empty
 *
 * @example
 * ```typescript
 * const line = '{"type":"text","timestamp":1234567890,"sessionID":"abc123","part":{"id":"1","type":"text","text":"Hello","time":{"start":0,"end":100}}}';
 * const event = parseOpenCodeEvent(line);
 * if (event && event.type === "text") {
 *   console.log(event.part.text); // "Hello"
 * }
 * ```
 */
export function parseOpenCodeEvent(line: string): OpenCodeEvent | null {
  // Handle empty or whitespace-only lines
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedLine);

    // Validate basic structure
    if (!parsed || typeof parsed !== "object") {
      Logger.warn(`Invalid event structure: not an object`);
      return null;
    }

    // Check for required fields
    if (typeof parsed.type !== "string") {
      Logger.warn(`Invalid event: missing or invalid 'type' field`);
      return null;
    }

    if (typeof parsed.timestamp !== "number") {
      Logger.warn(`Invalid event: missing or invalid 'timestamp' field`);
      return null;
    }

    if (typeof parsed.sessionID !== "string") {
      Logger.warn(`Invalid event: missing or invalid 'sessionID' field`);
      return null;
    }

    // Check if event type is known
    if (!KNOWN_EVENT_TYPES.has(parsed.type)) {
      Logger.warn(`Unknown event type: ${parsed.type}`);
      return null;
    }

    // Validate part exists
    if (!parsed.part || typeof parsed.part !== "object") {
      Logger.warn(`Invalid event: missing or invalid 'part' field`);
      return null;
    }

    return parsed as OpenCodeEvent;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.warn(`Failed to parse OpenCode event: ${errorMessage}`);
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if the given event represents a completion (final stop).
 * An event is a completion event if it's a step_finish with reason="stop".
 *
 * @param event - The event to check
 * @returns True if the event indicates the stream has completed
 *
 * @example
 * ```typescript
 * const event = parseOpenCodeEvent(line);
 * if (event && isCompletionEvent(event)) {
 *   console.log("Stream completed!");
 * }
 * ```
 */
export function isCompletionEvent(event: OpenCodeEvent): boolean {
  return event.type === "step_finish" && event.part.reason === "stop";
}

/**
 * Extracts the session ID from any OpenCode event.
 *
 * @param event - Any OpenCode event
 * @returns The session ID string
 *
 * @example
 * ```typescript
 * const event = parseOpenCodeEvent(line);
 * if (event) {
 *   const sessionId = extractSessionId(event);
 *   console.log(`Processing session: ${sessionId}`);
 * }
 * ```
 */
export function extractSessionId(event: OpenCodeEvent): string {
  return event.sessionID;
}

/**
 * Extracts the text content from a TextEvent.
 *
 * @param event - A text event
 * @returns The text content
 */
export function extractText(event: TextEvent): string {
  return event.part.text;
}

/**
 * Extracts token usage from a StepFinishEvent.
 *
 * @param event - A step finish event
 * @returns Token usage information
 */
export function extractTokenUsage(event: StepFinishEvent): TokenUsage {
  return event.part.tokens;
}

/**
 * Extracts the cost from a StepFinishEvent.
 *
 * @param event - A step finish event
 * @returns The cost of the step
 */
export function extractCost(event: StepFinishEvent): number {
  return event.part.cost;
}
