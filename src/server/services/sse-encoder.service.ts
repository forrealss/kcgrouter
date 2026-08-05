import type { CanonicalStreamChunk } from "../providers/types";

/**
 * Serializes canonical stream chunks into OpenAI-compatible SSE bytes.
 *
 * Clients (opencode, the OpenAI SDK, @ai-sdk/openai-compatible) require:
 *   - each event framed as `data: <json>\n\n`
 *   - the first chunk to announce the assistant role
 *   - a terminating `data: [DONE]\n\n`, without which they hang until timeout
 *
 * Everything here is byte-level output; callers pipe the result straight into
 * `new Response(...)` and must not stringify it.
 */

const encoder = new TextEncoder();

export const OPENAI_SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Proxies (nginx) otherwise buffer the whole stream and the client sees
  // nothing until completion, which defeats streaming.
  "X-Accel-Buffering": "no",
};

const FINISH_REASON_MAP: Record<
  NonNullable<CanonicalStreamChunk["finishReason"]>,
  string
> = {
  stop: "stop",
  length: "length",
  tool_call: "tool_calls",
  // OpenAI has no "error" finish reason; clients expect one of the known
  // values, so fall back to "stop".
  error: "stop",
};

interface ChunkDelta {
  role?: "assistant";
  content?: string;
}

export interface OpenAIChunkMeta {
  id: string;
  model: string;
  created: number;
}

export function newChunkMeta(model: string): OpenAIChunkMeta {
  return {
    id: `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    model,
    created: Math.floor(Date.now() / 1000),
  };
}

function buildChunk(
  meta: OpenAIChunkMeta,
  delta: ChunkDelta,
  finishReason: string | null,
): string {
  return JSON.stringify({
    id: meta.id,
    object: "chat.completion.chunk",
    created: meta.created,
    model: meta.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

function buildToolChunk(
  meta: OpenAIChunkMeta,
  delta: {
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: "function";
      function?: { name?: string; arguments?: string };
    }>;
  },
): string {
  return JSON.stringify({
    id: meta.id,
    object: "chat.completion.chunk",
    created: meta.created,
    model: meta.model,
    choices: [{ index: 0, delta, finish_reason: null }],
  });
}

function frame(payload: string): Uint8Array {
  return encoder.encode(`data: ${payload}\n\n`);
}

/** The sentinel that lets clients close the connection instead of timing out. */
export function doneBytes(): Uint8Array {
  return encoder.encode("data: [DONE]\n\n");
}

export function roleChunkBytes(meta: OpenAIChunkMeta): Uint8Array {
  return frame(buildChunk(meta, { role: "assistant" }, null));
}

export function contentChunkBytes(
  meta: OpenAIChunkMeta,
  text: string,
): Uint8Array {
  return frame(buildChunk(meta, { content: text }, null));
}

export function finishChunkBytes(
  meta: OpenAIChunkMeta,
  finishReason: NonNullable<CanonicalStreamChunk["finishReason"]>,
): Uint8Array {
  return frame(buildChunk(meta, {}, FINISH_REASON_MAP[finishReason] ?? "stop"));
}

/**
 * Emitted only when the client asked for usage via
 * `stream_options.include_usage`. OpenAI sends it as a final chunk with an
 * empty `choices` array.
 */
export function usageChunkBytes(
  meta: OpenAIChunkMeta,
  usage: { inputTokens: number; outputTokens: number },
): Uint8Array {
  return frame(
    JSON.stringify({
      id: meta.id,
      object: "chat.completion.chunk",
      created: meta.created,
      model: meta.model,
      choices: [],
      usage: {
        prompt_tokens: usage.inputTokens,
        completion_tokens: usage.outputTokens,
        total_tokens: usage.inputTokens + usage.outputTokens,
      },
    }),
  );
}

/**
 * Errors surfaced after the stream has already started. The HTTP status is
 * committed at that point, so the failure has to travel in-band or the client
 * just sees a truncated response with no explanation.
 */
export function errorChunkBytes(message: string): Uint8Array {
  return frame(
    JSON.stringify({
      error: { message, type: "server_error", code: "upstream_error" },
    }),
  );
}

export interface EncodeOptions {
  model: string;
  includeUsage: boolean;
}

/**
 * Wraps a canonical chunk stream into OpenAI SSE bytes, guaranteeing the
 * role-first / [DONE]-last contract even when the source stream is empty or
 * fails midway.
 *
 * When `collectedChunks` is provided, each chunk is pushed into it for
 * post-stream usage recording — avoids an extra collecting-reader wrapper.
 */
export function encodeOpenAIStream(
  source: ReadableStream<CanonicalStreamChunk>,
  options: EncodeOptions,
  onComplete?: (usage: { inputTokens: number; outputTokens: number }) => void,
  collectedChunks?: CanonicalStreamChunk[],
): ReadableStream<Uint8Array> {
  const meta = newChunkMeta(options.model);

  let roleSent = false;
  let finishSent = false;
  const usage = { inputTokens: 0, outputTokens: 0 };
  let toolIndex = 0;
  const toolIndexById = new Map<string, number>();

  const sseTransform = new TransformStream<CanonicalStreamChunk, Uint8Array>({
    transform(chunk, controller) {
      collectedChunks?.push(chunk);
      if (!roleSent) {
        controller.enqueue(roleChunkBytes(meta));
        roleSent = true;
      }

      if (chunk.usage) {
        usage.inputTokens = chunk.usage.inputTokens;
        usage.outputTokens = chunk.usage.outputTokens;
      }

      if (chunk.toolCallStart) {
        const { toolCallId, toolName } = chunk.toolCallStart;
        let idx = toolIndexById.get(toolCallId);
        if (idx == null) {
          idx = toolIndex++;
          toolIndexById.set(toolCallId, idx);
        }
        controller.enqueue(
          frame(
            buildToolChunk(meta, {
              tool_calls: [
                {
                  index: idx,
                  id: toolCallId,
                  type: "function",
                  function: { name: toolName, arguments: "" },
                },
              ],
            }),
          ),
        );
      }

      if (chunk.toolCallDelta) {
        const { toolCallId, arguments: args } = chunk.toolCallDelta;
        const idx = toolIndexById.get(toolCallId);
        if (idx != null && args) {
          controller.enqueue(
            frame(
              buildToolChunk(meta, {
                tool_calls: [{ index: idx, function: { arguments: args } }],
              }),
            ),
          );
        }
      }

      if (chunk.delta) {
        controller.enqueue(contentChunkBytes(meta, chunk.delta));
      }

      if (chunk.reasoning) {
        const delta: Record<string, unknown> = {};
        if (!roleSent) {
          delta.role = "assistant";
          roleSent = true;
        }
        delta.reasoning_content = chunk.reasoning;
        controller.enqueue(
          frame(
            JSON.stringify({
              id: meta.id,
              object: "chat.completion.chunk",
              created: meta.created,
              model: meta.model,
              choices: [{ index: 0, delta, finish_reason: null }],
            }),
          ),
        );
      }

      if (chunk.finishReason && !finishSent) {
        controller.enqueue(finishChunkBytes(meta, chunk.finishReason));
        finishSent = true;
      }
    },

    flush(controller) {
      if (!finishSent) {
        if (!roleSent) {
          controller.enqueue(roleChunkBytes(meta));
          roleSent = true;
        }
        controller.enqueue(finishChunkBytes(meta, "stop"));
      }
    },
  });

  const piped = source.pipeThrough(sseTransform);
  const reader = piped.getReader();
  let closed = false;

  function settle(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (closed) return;
    closed = true;
    if (options.includeUsage) {
      controller.enqueue(usageChunkBytes(meta, usage));
    }
    controller.enqueue(doneBytes());
    controller.close();
    onComplete?.(usage);
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          settle(controller);
          return;
        }

        controller.enqueue(value);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream error";
        if (!closed) {
          controller.enqueue(errorChunkBytes(message));
          settle(controller);
        }
      }
    },

    cancel(reason) {
      closed = true;
      reader.cancel(reason).catch(() => {});
      onComplete?.(usage);
    },
  });
}
