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
 * The `parseChunk` callback receives each parsed JSON object and the stream
 * controller, and is responsible for calling `controller.enqueue()`.
 */
export function createSSEStream(
  res: Response,
  parseChunk: SSEParseCallback,
): ReadableStream<CanonicalStreamChunk> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<CanonicalStreamChunk>({
    async pull(controller) {
      if (!reader) {
        controller.close();
        return;
      }

      const { done, value } = await reader.read();
      if (done || !value) {
        controller.close();
        return;
      }

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          parseChunk(parsed, controller);
        } catch {
          // skip malformed chunks
        }
      }
    },
  });
}
