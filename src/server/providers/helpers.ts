import { carryRetryMeta, fetchWithRetry, providerError } from "./retry";
import type {
  AdapterRequestOptions,
  CanonicalMessage,
  CanonicalRequest,
  CanonicalStreamChunk,
} from "./types";

// --- Message Building ---

/**
 * Converts a canonical request's messages into OpenAI-wire format
 * (string/array content, tool_calls, tool_call_id). Shared by every adapter
 * that speaks the OpenAI chat wire format (openai, mimo, qoder, ...).
 */
export function buildOpenAIMessages(req: CanonicalRequest): unknown[] {
  return req.messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role };

    const textParts = m.content.filter((p) => p.type === "text");
    const imageParts = m.content.filter((p) => p.type === "image");
    const toolCalls = m.content.filter((p) => p.type === "tool_call");
    const toolResults = m.content.filter((p) => p.type === "tool_result");

    // If there are images, use array format for content
    if (imageParts.length > 0) {
      const contentArray: unknown[] = [];

      // Add text parts
      for (const p of textParts) {
        contentArray.push({
          type: "text",
          text: (p as { type: "text"; text: string }).text,
        });
      }

      // Add image parts as image_url
      for (const p of imageParts) {
        const imageData = (p as { type: "image"; image: string }).image;
        contentArray.push({
          type: "image_url",
          image_url: { url: imageData },
        });
      }

      msg.content = contentArray;
    } else if (textParts.length > 0) {
      msg.content = textParts
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");
    }

    if (toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map((p) => {
        const tc = p as {
          type: "tool_call";
          id: string;
          name: string;
          arguments: unknown;
        };
        return {
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        };
      });
    }

    if (toolResults.length > 0) {
      const tr = toolResults[0] as {
        type: "tool_result";
        toolCallId: string;
        content: string;
      };
      msg.role = "tool";
      msg.tool_call_id = tr.toolCallId;
      msg.content = tr.content;
    }

    if (m.toolCallId && m.role !== "tool") {
      msg.tool_call_id = m.toolCallId;
    }

    return msg;
  });
}

// --- System Message ---

/**
 * Extracts and joins all system message text from a canonical request.
 * Returns undefined if no system messages exist.
 */
export function extractSystemText(req: CanonicalRequest): string | undefined {
  const parts: string[] = [];
  for (const m of req.messages) {
    if (m.role === "system") {
      for (const p of m.content) {
        if (p.type === "text") parts.push(p.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Extracts and joins all system message text from a message array.
 * Returns undefined if no system messages exist.
 */
export function extractSystemFromMessages(
  messages: CanonicalMessage[],
): string | undefined {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      for (const p of m.content) {
        if (p.type === "text") parts.push(p.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

// --- Tool Argument Parsing ---

/**
 * Parses tool call arguments that may arrive as a JSON string or pre-parsed object.
 * Returns the parsed object, or the original value if parsing fails.
 */
export function parseToolArguments(args: unknown): unknown {
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return args;
    }
  }
  return args;
}

// --- Fetch Helpers ---

/**
 * Sends a POST request to a provider API, throwing on non-2xx responses.
 * Returns the parsed JSON response. `opts.retry` forwards the provider's
 * retry policy (if any) into fetchWithRetry.
 */
export async function fetchJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  providerName: string,
  opts?: AdapterRequestOptions,
): Promise<unknown> {
  const res = await fetchWithRetry(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    { providerName, retry: opts?.retry },
  );

  if (!res.ok) {
    const text = await res.text();
    throw providerError(providerName, res, text);
  }

  // Carry retry metadata onto the parsed payload so the router can record how
  // many retries a successful non-streaming request went through.
  const data = await res.json();
  if (data && typeof data === "object") {
    return carryRetryMeta(data as object, res);
  }
  return data;
}

// --- SSE Stream Reader ---

type SSEParseCallback = (
  parsed: Record<string, unknown>,
  controller: ReadableStreamDefaultController<CanonicalStreamChunk>,
) => void;

/**
 * Creates a ReadableStream that reads SSE events from a Response body.
 * Handles the common pattern of: read chunks -> decode -> split on newlines
 * -> filter "data: " lines -> JSON.parse -> delegate to provider-specific parser.
 *
 * Guarantees the stream closes properly even if the upstream connection drops
 * mid-event or the final chunk lacks a trailing newline.
 */
export function createSSEStream(
  res: Response,
  parseChunk: SSEParseCallback,
): ReadableStream<CanonicalStreamChunk> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<CanonicalStreamChunk>({
    async pull(controller) {
      if (!reader) {
        controller.close();
        return;
      }

      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      if (done) {
        // Flush remaining buffer — the last event may lack a trailing newline
        if (buffer.length > 0) {
          processLines(buffer, parseChunk, controller);
          buffer = "";
        }
        controller.close();
        return;
      }

      // Process complete lines, keep the (potentially incomplete) tail
      const nlIndex = buffer.lastIndexOf("\n");
      if (nlIndex === -1) return; // no complete line yet

      const complete = buffer.slice(0, nlIndex + 1);
      buffer = buffer.slice(nlIndex + 1);

      processLines(complete, parseChunk, controller);
    },
  });
}

function processLines(
  text: string,
  parseChunk: SSEParseCallback,
  controller: ReadableStreamDefaultController<CanonicalStreamChunk>,
): void {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Standard SSE: "data: {...}"
    if (trimmed.startsWith("data: ")) {
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        parseChunk(parsed, controller);
      } catch {
        // skip malformed chunks
      }
      continue;
    }

    // Some providers send bare JSON lines without "data: " prefix
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        parseChunk(parsed, controller);
      } catch {
        // skip malformed chunks
      }
    }
  }
}
