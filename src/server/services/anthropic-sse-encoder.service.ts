import type { CanonicalStreamChunk } from "../providers/types";

/**
 * Serializes canonical stream chunks into Anthropic Messages API SSE bytes.
 *
 * Anthropic clients (Claude Code, the Anthropic SDK) require a stateful event
 * sequence rather than OpenAI's flat `data:` frames:
 *
 *   - `event: <type>` + `data: <json>` per frame
 *   - `message_start` announces the assistant message and its (initially
 *     empty) content array
 *   - text/tool-use/thinking content arrives as `content_block_start` →
 *     `content_block_delta` → `content_block_stop`, one block at a time,
 *     with strictly increasing block indexes
 *   - `message_delta` carries the final stop_reason + usage
 *   - `message_stop` terminates the stream (no `[DONE]` sentinel — Anthropic
 *     clients would treat that as an unknown event and may abort)
 *
 * Everything here is byte-level output; callers pipe the result straight into
 * `new Response(...)` and must not stringify it.
 */

const encoder = new TextEncoder();

export const ANTHROPIC_SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Proxies (nginx) otherwise buffer the whole stream and the client sees
  // nothing until completion, which defeats streaming.
  "X-Accel-Buffering": "no",
};

/** Keepalive ping for the early-stream keepalive wrapper (official Messages API `ping` event). */
export const ANTHROPIC_KEEPALIVE_FRAME: Uint8Array = encoder.encode(
  'event: ping\ndata: {"type":"ping"}\n\n',
);

/** In-band error frame for failures after the stream has already started. */
export const ANTHROPIC_ERROR_FRAME: Uint8Array = encoder.encode(
  'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"Upstream stream failed before completion."}}\n\n',
);

/**
 * The two controller shapes used here (TransformStream's transform() and the
 * outer ReadableStream's pull()) share `enqueue`; only the outer one also
 * has `close`. Accepting the minimal surface keeps the block helpers usable
 * from both.
 */
interface EnqueueController {
  enqueue(chunk: Uint8Array): void;
}

function frame(event: string, payload: unknown): Uint8Array {
  return encoder.encode(
    `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
  );
}

const STOP_REASON_MAP: Record<
  NonNullable<CanonicalStreamChunk["finishReason"]>,
  string
> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_call: "tool_use",
  // Anthropic has no "error" stop reason; fall back to end_turn so the
  // sequence still terminates cleanly for clients that ignore `error` events.
  error: "end_turn",
};

function newMessageId(): string {
  return `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function messageStartBytes(model: string, messageId: string): Uint8Array {
  return frame("message_start", {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      // Real usage arrives with message_delta; 0s keep the initial payload
      // spec-conformant (input_tokens is required by the Messages API).
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });
}

function contentBlockStartBytes(
  index: number,
  contentBlock: {
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: unknown;
  },
): Uint8Array {
  return frame("content_block_start", {
    type: "content_block_start",
    index,
    content_block: contentBlock,
  });
}

function contentBlockDeltaBytes(
  index: number,
  delta: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  },
): Uint8Array {
  return frame("content_block_delta", {
    type: "content_block_delta",
    index,
    delta,
  });
}

function contentBlockStopBytes(index: number): Uint8Array {
  return frame("content_block_stop", { type: "content_block_stop", index });
}

function messageDeltaBytes(
  stopReason: string,
  usage: { inputTokens: number; outputTokens: number },
): Uint8Array {
  return frame("message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    },
  });
}

function messageStopBytes(): Uint8Array {
  return frame("message_stop", { type: "message_stop" });
}

export interface AnthropicEncodeOptions {
  model: string;
}

/**
 * Wraps a canonical chunk stream into Anthropic Messages SSE bytes,
 * guaranteeing the message_start → … → message_stop contract even when the
 * source stream is empty or fails midway.
 *
 * When `collectedChunks` is provided, each chunk is pushed into it for
 * post-stream usage recording — avoids an extra collecting-reader wrapper.
 */
export function encodeAnthropicStream(
  source: ReadableStream<CanonicalStreamChunk>,
  options: AnthropicEncodeOptions,
  onComplete?: (usage: { inputTokens: number; outputTokens: number }) => void,
  collectedChunks?: CanonicalStreamChunk[],
): ReadableStream<Uint8Array> {
  const messageId = newMessageId();

  let messageStartSent = false;
  let finishSent = false;
  const usage = { inputTokens: 0, outputTokens: 0 };

  // Anthropic content blocks are strictly sequential: a block must stop
  // before the next index starts. Track the single open text/thinking block
  // plus every open tool block (keyed by tool call id for delta correlation).
  let textBlockIndex: number | null = null;
  let thinkingBlockIndex: number | null = null;
  const toolBlockIndexByCallId = new Map<string, number>();
  let nextBlockIndex = 0;

  function stopOpenBlocks(controller: EnqueueController) {
    if (thinkingBlockIndex !== null) {
      controller.enqueue(contentBlockStopBytes(thinkingBlockIndex));
      thinkingBlockIndex = null;
    }
    if (textBlockIndex !== null) {
      controller.enqueue(contentBlockStopBytes(textBlockIndex));
      textBlockIndex = null;
    }
    for (const blockIndex of toolBlockIndexByCallId.values()) {
      controller.enqueue(contentBlockStopBytes(blockIndex));
    }
    toolBlockIndexByCallId.clear();
  }

  /** Emits message_delta + message_stop. Safe to call once; idempotent. */
  function finish(controller: EnqueueController, stopReason: string) {
    if (finishSent) return;
    if (!messageStartSent) {
      controller.enqueue(messageStartBytes(options.model, messageId));
      messageStartSent = true;
    }
    finishSent = true;
    stopOpenBlocks(controller);
    controller.enqueue(messageDeltaBytes(stopReason, usage));
    controller.enqueue(messageStopBytes());
  }

  const sseTransform = new TransformStream<CanonicalStreamChunk, Uint8Array>({
    transform(chunk, controller) {
      collectedChunks?.push(chunk);

      if (!messageStartSent) {
        controller.enqueue(messageStartBytes(options.model, messageId));
        messageStartSent = true;
      }

      if (chunk.usage) {
        usage.inputTokens = chunk.usage.inputTokens;
        usage.outputTokens = chunk.usage.outputTokens;
      }

      // Thinking / reasoning block — opened by `reasoning` chunks (which may
      // carry an empty string to signal a block start).
      if (chunk.reasoning !== undefined && !finishSent) {
        if (textBlockIndex !== null) {
          controller.enqueue(contentBlockStopBytes(textBlockIndex));
          textBlockIndex = null;
        }
        if (thinkingBlockIndex === null) {
          thinkingBlockIndex = nextBlockIndex++;
          controller.enqueue(
            contentBlockStartBytes(thinkingBlockIndex, {
              type: "thinking",
              thinking: "",
            }),
          );
        }
        if (chunk.reasoning !== "") {
          controller.enqueue(
            contentBlockDeltaBytes(thinkingBlockIndex, {
              type: "thinking_delta",
              thinking: chunk.reasoning,
            }),
          );
        }
      }

      // Text content.
      if (chunk.delta && !finishSent) {
        if (thinkingBlockIndex !== null) {
          controller.enqueue(contentBlockStopBytes(thinkingBlockIndex));
          thinkingBlockIndex = null;
        }
        if (textBlockIndex === null) {
          textBlockIndex = nextBlockIndex++;
          controller.enqueue(
            contentBlockStartBytes(textBlockIndex, { type: "text", text: "" }),
          );
        }
        controller.enqueue(
          contentBlockDeltaBytes(textBlockIndex, {
            type: "text_delta",
            text: chunk.delta,
          }),
        );
      }

      // Tool call start.
      if (chunk.toolCallStart && !finishSent) {
        if (thinkingBlockIndex !== null) {
          controller.enqueue(contentBlockStopBytes(thinkingBlockIndex));
          thinkingBlockIndex = null;
        }
        if (textBlockIndex !== null) {
          controller.enqueue(contentBlockStopBytes(textBlockIndex));
          textBlockIndex = null;
        }
        const { toolCallId, toolName } = chunk.toolCallStart;
        if (!toolBlockIndexByCallId.has(toolCallId)) {
          const blockIndex = nextBlockIndex++;
          toolBlockIndexByCallId.set(toolCallId, blockIndex);
          controller.enqueue(
            contentBlockStartBytes(blockIndex, {
              type: "tool_use",
              id: toolCallId,
              name: toolName,
              input: {},
            }),
          );
        }
      }

      // Tool call argument fragments.
      if (chunk.toolCallDelta && !finishSent) {
        const { toolCallId, arguments: args } = chunk.toolCallDelta;
        const blockIndex = toolBlockIndexByCallId.get(toolCallId);
        if (blockIndex !== undefined && args) {
          controller.enqueue(
            contentBlockDeltaBytes(blockIndex, {
              type: "input_json_delta",
              partial_json: args,
            }),
          );
        }
      }

      if (chunk.finishReason && !finishSent) {
        finish(controller, STOP_REASON_MAP[chunk.finishReason] ?? "end_turn");
      }
    },

    flush(controller) {
      if (!finishSent) {
        if (!messageStartSent) {
          controller.enqueue(messageStartBytes(options.model, messageId));
          messageStartSent = true;
        }
        finish(controller, "end_turn");
      }
    },
  });

  const piped = source.pipeThrough(sseTransform);
  const reader = piped.getReader();
  let closed = false;

  function settle(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (closed) return;
    closed = true;
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
          // Keep the sequence well-formed even when the upstream dies before
          // its first chunk: message_start must precede any error frame.
          if (!messageStartSent) {
            controller.enqueue(messageStartBytes(options.model, messageId));
            messageStartSent = true;
          }
          controller.enqueue(
            frame("error", {
              type: "error",
              error: { type: "api_error", message },
            }),
          );
          // Some clients ignore `error` events and only close on
          // message_stop; send it so the stream always terminates.
          finish(controller, "end_turn");
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
