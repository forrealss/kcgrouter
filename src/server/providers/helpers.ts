import type {
  CanonicalMessage,
  CanonicalRequest,
  CanonicalStreamChunk,
} from "./types";

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
 * Returns the parsed JSON response.
 */
export async function fetchJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  providerName: string,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${providerName} API error ${res.status}: ${text}`);
  }

  return res.json();
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
