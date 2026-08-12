import type { ProviderTransport } from "../../db/schema";
import type { RetryConfig } from "./retry";

// --- Canonical Types ---

export interface CanonicalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: CanonicalContentPart[];
  toolCallId?: string;
}

export type CanonicalContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
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

/**
 * Optional per-request options passed from the router to an adapter. Today it
 * carries the provider's retry policy (stored per provider record and editable
 * from the UI); the adapter forwards it into `fetchWithRetry`. Undefined means
 * "use the global defaults".
 */
export interface AdapterRequestOptions {
  retry?: RetryConfig;
}

export interface ProviderAdapter {
  readonly transport: ProviderTransport;
  send(
    request: CanonicalRequest,
    credential: { apiKey: string },
    model: string,
    baseUrl?: string,
    opts?: AdapterRequestOptions,
  ): Promise<CanonicalResponse>;
  sendStream(
    request: CanonicalRequest,
    credential: { apiKey: string },
    model: string,
    baseUrl?: string,
    opts?: AdapterRequestOptions,
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
