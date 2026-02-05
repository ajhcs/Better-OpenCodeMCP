import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseOpenCodeEvent,
  isCompletionEvent,
  extractSessionId,
  isStepStartEvent,
  isTextEvent,
  isToolUseEvent,
  isStepFinishEvent,
  extractText,
  extractTokenUsage,
  extractCost,
  type StepStartEvent,
  type TextEvent,
  type ToolUseEvent,
  type StepFinishEvent,
  type OpenCodeEvent,
} from "../utils/jsonEventParser.js";

// Mock the Logger to prevent console output during tests
vi.mock("../utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("jsonEventParser", () => {
  // Sample events for testing
  const sampleStepStartEvent: StepStartEvent = {
    type: "step_start",
    timestamp: 1706000000000,
    sessionID: "session-abc-123",
    part: {
      id: "part-1",
      type: "step-start",
      snapshot: "Initial snapshot state",
    },
  };

  const sampleTextEvent: TextEvent = {
    type: "text",
    timestamp: 1706000001000,
    sessionID: "session-abc-123",
    part: {
      id: "part-2",
      type: "text",
      text: "Hello, this is a response from the model.",
      time: {
        start: 0,
        end: 150,
      },
    },
  };

  const sampleToolUseEvent: ToolUseEvent = {
    type: "tool_use",
    timestamp: 1706000002000,
    sessionID: "session-abc-123",
    part: {
      id: "part-3",
      type: "tool",
      tool: "read_file",
      callID: "call-xyz-789",
      state: {
        status: "completed",
        input: { path: "/src/index.ts" },
        output: "file contents here...",
        metadata: {
          exit: 0,
          truncated: false,
        },
      },
    },
  };

  const sampleStepFinishEventStop: StepFinishEvent = {
    type: "step_finish",
    timestamp: 1706000003000,
    sessionID: "session-abc-123",
    part: {
      id: "part-4",
      type: "step-finish",
      reason: "stop",
      tokens: {
        input: 1000,
        output: 500,
        reasoning: 200,
      },
      cost: 0.0123,
    },
  };

  const sampleStepFinishEventToolCalls: StepFinishEvent = {
    type: "step_finish",
    timestamp: 1706000003000,
    sessionID: "session-abc-123",
    part: {
      id: "part-5",
      type: "step-finish",
      reason: "tool-calls",
      tokens: {
        input: 800,
        output: 300,
        reasoning: 100,
      },
      cost: 0.0089,
    },
  };

  describe("parseOpenCodeEvent", () => {
    it("should parse a valid step_start event", () => {
      const line = JSON.stringify(sampleStepStartEvent);
      const result = parseOpenCodeEvent(line);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("step_start");
      expect(result!.timestamp).toBe(1706000000000);
      expect(result!.sessionID).toBe("session-abc-123");

      if (isStepStartEvent(result!)) {
        expect(result.part.type).toBe("step-start");
        expect(result.part.snapshot).toBe("Initial snapshot state");
      }
    });

    it("should parse a valid text event", () => {
      const line = JSON.stringify(sampleTextEvent);
      const result = parseOpenCodeEvent(line);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("text");

      if (isTextEvent(result!)) {
        expect(result.part.text).toBe("Hello, this is a response from the model.");
        expect(result.part.time.start).toBe(0);
        expect(result.part.time.end).toBe(150);
      }
    });

    it("should parse a valid tool_use event", () => {
      const line = JSON.stringify(sampleToolUseEvent);
      const result = parseOpenCodeEvent(line);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("tool_use");

      if (isToolUseEvent(result!)) {
        expect(result.part.tool).toBe("read_file");
        expect(result.part.callID).toBe("call-xyz-789");
        expect(result.part.state.status).toBe("completed");
        expect(result.part.state.input).toEqual({ path: "/src/index.ts" });
        expect(result.part.state.output).toBe("file contents here...");
        expect(result.part.state.metadata.exit).toBe(0);
        expect(result.part.state.metadata.truncated).toBe(false);
      }
    });

    it("should parse a valid step_finish event with reason=stop", () => {
      const line = JSON.stringify(sampleStepFinishEventStop);
      const result = parseOpenCodeEvent(line);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("step_finish");

      if (isStepFinishEvent(result!)) {
        expect(result.part.reason).toBe("stop");
        expect(result.part.tokens.input).toBe(1000);
        expect(result.part.tokens.output).toBe(500);
        expect(result.part.tokens.reasoning).toBe(200);
        expect(result.part.cost).toBe(0.0123);
      }
    });

    it("should parse a valid step_finish event with reason=tool-calls", () => {
      const line = JSON.stringify(sampleStepFinishEventToolCalls);
      const result = parseOpenCodeEvent(line);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("step_finish");

      if (isStepFinishEvent(result!)) {
        expect(result.part.reason).toBe("tool-calls");
      }
    });

    it("should return null for empty string", () => {
      const result = parseOpenCodeEvent("");
      expect(result).toBeNull();
    });

    it("should return null for whitespace-only string", () => {
      const result = parseOpenCodeEvent("   \n\t  ");
      expect(result).toBeNull();
    });

    it("should return null for malformed JSON", () => {
      const result = parseOpenCodeEvent("{invalid json}");
      expect(result).toBeNull();
    });

    it("should return null for incomplete JSON", () => {
      const result = parseOpenCodeEvent('{"type": "text", "timestamp": 123');
      expect(result).toBeNull();
    });

    it("should return null for JSON missing type field", () => {
      const result = parseOpenCodeEvent('{"timestamp": 123, "sessionID": "abc", "part": {}}');
      expect(result).toBeNull();
    });

    it("should return null for JSON missing timestamp field", () => {
      const result = parseOpenCodeEvent('{"type": "text", "sessionID": "abc", "part": {}}');
      expect(result).toBeNull();
    });

    it("should return null for JSON missing sessionID field", () => {
      const result = parseOpenCodeEvent('{"type": "text", "timestamp": 123, "part": {}}');
      expect(result).toBeNull();
    });

    it("should return null for JSON missing part field", () => {
      const result = parseOpenCodeEvent('{"type": "text", "timestamp": 123, "sessionID": "abc"}');
      expect(result).toBeNull();
    });

    it("should return null for unknown event type", () => {
      const unknownEvent = {
        type: "unknown_type",
        timestamp: 123,
        sessionID: "abc",
        part: { id: "1" },
      };
      const result = parseOpenCodeEvent(JSON.stringify(unknownEvent));
      expect(result).toBeNull();
    });

    it("should return null for non-object JSON values", () => {
      expect(parseOpenCodeEvent('"just a string"')).toBeNull();
      expect(parseOpenCodeEvent("42")).toBeNull();
      expect(parseOpenCodeEvent("true")).toBeNull();
      expect(parseOpenCodeEvent("null")).toBeNull();
      expect(parseOpenCodeEvent("[1, 2, 3]")).toBeNull();
    });

    it("should handle line with leading/trailing whitespace", () => {
      const line = "  " + JSON.stringify(sampleTextEvent) + "  \n";
      const result = parseOpenCodeEvent(line);

      expect(result).not.toBeNull();
      expect(result!.type).toBe("text");
    });
  });

  describe("isCompletionEvent", () => {
    it("should return true for step_finish with reason=stop", () => {
      const result = isCompletionEvent(sampleStepFinishEventStop);
      expect(result).toBe(true);
    });

    it("should return false for step_finish with reason=tool-calls", () => {
      const result = isCompletionEvent(sampleStepFinishEventToolCalls);
      expect(result).toBe(false);
    });

    it("should return false for step_start event", () => {
      const result = isCompletionEvent(sampleStepStartEvent);
      expect(result).toBe(false);
    });

    it("should return false for text event", () => {
      const result = isCompletionEvent(sampleTextEvent);
      expect(result).toBe(false);
    });

    it("should return false for tool_use event", () => {
      const result = isCompletionEvent(sampleToolUseEvent);
      expect(result).toBe(false);
    });
  });

  describe("extractSessionId", () => {
    it("should extract session ID from step_start event", () => {
      const result = extractSessionId(sampleStepStartEvent);
      expect(result).toBe("session-abc-123");
    });

    it("should extract session ID from text event", () => {
      const result = extractSessionId(sampleTextEvent);
      expect(result).toBe("session-abc-123");
    });

    it("should extract session ID from tool_use event", () => {
      const result = extractSessionId(sampleToolUseEvent);
      expect(result).toBe("session-abc-123");
    });

    it("should extract session ID from step_finish event", () => {
      const result = extractSessionId(sampleStepFinishEventStop);
      expect(result).toBe("session-abc-123");
    });
  });

  describe("type guards", () => {
    it("isStepStartEvent should correctly identify step_start events", () => {
      expect(isStepStartEvent(sampleStepStartEvent)).toBe(true);
      expect(isStepStartEvent(sampleTextEvent)).toBe(false);
      expect(isStepStartEvent(sampleToolUseEvent)).toBe(false);
      expect(isStepStartEvent(sampleStepFinishEventStop)).toBe(false);
    });

    it("isTextEvent should correctly identify text events", () => {
      expect(isTextEvent(sampleStepStartEvent)).toBe(false);
      expect(isTextEvent(sampleTextEvent)).toBe(true);
      expect(isTextEvent(sampleToolUseEvent)).toBe(false);
      expect(isTextEvent(sampleStepFinishEventStop)).toBe(false);
    });

    it("isToolUseEvent should correctly identify tool_use events", () => {
      expect(isToolUseEvent(sampleStepStartEvent)).toBe(false);
      expect(isToolUseEvent(sampleTextEvent)).toBe(false);
      expect(isToolUseEvent(sampleToolUseEvent)).toBe(true);
      expect(isToolUseEvent(sampleStepFinishEventStop)).toBe(false);
    });

    it("isStepFinishEvent should correctly identify step_finish events", () => {
      expect(isStepFinishEvent(sampleStepStartEvent)).toBe(false);
      expect(isStepFinishEvent(sampleTextEvent)).toBe(false);
      expect(isStepFinishEvent(sampleToolUseEvent)).toBe(false);
      expect(isStepFinishEvent(sampleStepFinishEventStop)).toBe(true);
      expect(isStepFinishEvent(sampleStepFinishEventToolCalls)).toBe(true);
    });
  });

  describe("helper functions", () => {
    it("extractText should extract text from TextEvent", () => {
      const result = extractText(sampleTextEvent);
      expect(result).toBe("Hello, this is a response from the model.");
    });

    it("extractTokenUsage should extract token info from StepFinishEvent", () => {
      const result = extractTokenUsage(sampleStepFinishEventStop);
      expect(result).toEqual({
        input: 1000,
        output: 500,
        reasoning: 200,
      });
    });

    it("extractCost should extract cost from StepFinishEvent", () => {
      const result = extractCost(sampleStepFinishEventStop);
      expect(result).toBe(0.0123);
    });
  });

  describe("integration scenarios", () => {
    it("should parse a typical stream sequence", () => {
      const stream = [
        JSON.stringify(sampleStepStartEvent),
        JSON.stringify(sampleTextEvent),
        JSON.stringify(sampleToolUseEvent),
        JSON.stringify(sampleStepFinishEventToolCalls),
        JSON.stringify(sampleStepStartEvent),
        JSON.stringify(sampleTextEvent),
        JSON.stringify(sampleStepFinishEventStop),
      ];

      const events = stream.map(parseOpenCodeEvent).filter((e): e is OpenCodeEvent => e !== null);

      expect(events).toHaveLength(7);
      expect(events[0].type).toBe("step_start");
      expect(events[1].type).toBe("text");
      expect(events[2].type).toBe("tool_use");
      expect(events[3].type).toBe("step_finish");
      expect(isCompletionEvent(events[3])).toBe(false);
      expect(events[6].type).toBe("step_finish");
      expect(isCompletionEvent(events[6])).toBe(true);
    });

    it("should handle stream with empty lines and malformed entries", () => {
      const stream = [
        JSON.stringify(sampleStepStartEvent),
        "",
        "   ",
        "{malformed}",
        JSON.stringify(sampleTextEvent),
        JSON.stringify(sampleStepFinishEventStop),
      ];

      const events = stream.map(parseOpenCodeEvent).filter((e): e is OpenCodeEvent => e !== null);

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe("step_start");
      expect(events[1].type).toBe("text");
      expect(events[2].type).toBe("step_finish");
    });
  });
});
