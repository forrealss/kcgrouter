/** Kiro wire-format types and shared constants. */

// --- Wire Types ---

export interface KiroToolResult {
  toolUseId: string;
  status: string;
  content: Array<{ text: string }>;
}

export interface KiroMessageContext {
  toolResults?: KiroToolResult[];
  tools?: Record<string, unknown>[];
}

/** Inline image attached to a user turn (`userInputMessage.images`). */
export interface KiroImage {
  /** MIME subtype, e.g. `png`, `jpeg`, `webp`, `gif`. */
  format: string;
  /** Raw base64 payload (no `data:` prefix). */
  source: { bytes: string };
}

export interface KiroMessage {
  userInputMessage?: {
    content: string;
    modelId: string;
    origin: string;
    images?: KiroImage[];
    userInputMessageContext?: KiroMessageContext;
  };
  assistantResponseMessage?: {
    content: string;
    toolUses?: Array<{
      toolUseId: string;
      name: string;
      input: unknown;
    }>;
  };
}

// --- Constants ---

/** Set KIRO_DEBUG=1 to log every upstream eventstream frame. */
export const KIRO_DEBUG = process.env.KIRO_DEBUG === "1";

/** Max tool-name length Kiro accepts before it rejects the request. */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * JSON-Schema keywords Kiro/CodeWhisperer rejects anywhere in a tool schema.
 * Their presence yields HTTP 400 "Improperly formed request".
 */
export const SCHEMA_STRIP_KEYS = new Set([
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",
  "if",
  "then",
  "else",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contentEncoding",
  "contentMediaType",
]);

export const KIRO_URL =
  "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";
