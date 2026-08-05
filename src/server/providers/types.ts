import type { ProviderTransport } from "../../db/schema";

// --- Canonical Types ---

export interface CanonicalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: CanonicalContentPart[];
  toolCallId?: string;
}

export type CanonicalContentPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; toolCallId: string; content: string };

export interface CanonicalRequest {
  messages: CanonicalMessage[];
  modelHint?: string;
  maxTokens?: number;
  temperature?: number;
  stream: boolean;
  tools?: CanonicalToolDefinition[];
}

export interface CanonicalToolDefinition {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface CanonicalResponse {
  message: CanonicalMessage;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: "stop" | "length" | "tool_call" | "error";
}

export interface CanonicalStreamChunk {
  delta?: string;
  reasoning?: string;
  toolCallStart?: {
    toolCallId: string;
    toolName: string;
  };
  toolCallDelta?: {
    toolCallId: string;
    arguments: string;
  };
  finishReason?: "stop" | "length" | "tool_call" | "error";
  usage?: { inputTokens: number; outputTokens: number };
}

// --- Provider Adapter Interface ---

export interface ProviderAdapter {
  readonly transport: ProviderTransport;
  send(
    request: CanonicalRequest,
    credential: { apiKey: string },
    model: string,
  ): Promise<CanonicalResponse>;
  sendStream(
    request: CanonicalRequest,
    credential: { apiKey: string },
    model: string,
  ): Promise<ReadableStream<CanonicalStreamChunk>>;
}

// --- Model Info ---

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  maxOutputTokens?: number;
}

// --- Provider Config ---

export interface ProviderConfig {
  transport: ProviderTransport;
  baseUrl: string;
  authType: "apikey" | "oauth";
  authHeader: string;
  defaultHeaders?: Record<string, string>;
  defaultModels?: ModelInfo[];
}
