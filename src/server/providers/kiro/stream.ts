/**
 * Kiro streaming response handler.
 *
 * Kiro uses AWS EventStream (binary frames) instead of SSE. The connection
 * stays open after the turn ends, so termination is detected by specific
 * frame types (metadataEvent, meteringEvent, messageStopEvent) rather than EOF.
 */
import type { CanonicalStreamChunk } from "../types";
import { ByteQueue, parseEventFrame } from "./eventstream";
import { extractReasoningText } from "./reasoning";
import {
  flushPendingThinking,
  type KiroThinkingState,
  splitInlineThinking,
} from "./thinking";
import { KIRO_DEBUG } from "./types";
import {
  estimateKiroUsage,
  parseKiroMetering,
  parseKiroTokenUsage,
} from "./usage";

type Ctl = ReadableStreamDefaultController<CanonicalStreamChunk>;

/** State shared across frame handling, queue draining, and finalization. */
interface StreamState {
  queue: ByteQueue;
  thinkingState: KiroThinkingState;
  usage: { inputTokens: number; outputTokens: number };
  contextUsagePercentage: number;
  outputChars: number;
  closed: boolean;
  stopSeen: boolean;
  startedTools: Set<string>;
  bufferedObjectArgs: Map<string, string>;
  emittedToolArgs: Map<string, string>;
}

/** Emits buffered object-form tool arguments, skipping anything already sent. */
function flushBufferedToolArgs(state: StreamState, controller: Ctl): void {
  if (state.bufferedObjectArgs.size === 0) return;
  for (const [toolCallId, canonical] of state.bufferedObjectArgs) {
    if (canonical && canonical !== state.emittedToolArgs.get(toolCallId)) {
      controller.enqueue({
        toolCallDelta: { toolCallId, arguments: canonical },
      });
      state.emittedToolArgs.set(toolCallId, canonical);
    }
  }
  state.bufferedObjectArgs.clear();
}

/** Processes one decoded frame. Returns true when the turn is complete. */
function handleFrame(
  state: StreamState,
  frame: NonNullable<ReturnType<typeof parseEventFrame>>,
  controller: Ctl,
): boolean {
  const eventType = frame.headers[":event-type"] ?? "";
  const payload = frame.payload;

  // An upstream exception frame ends the turn.
  const messageType = frame.headers[":message-type"];
  const exceptionType = frame.headers[":exception-type"];
  if (messageType === "exception" || exceptionType) {
    const detail =
      (payload?.message as string) ??
      (payload?.Message as string) ??
      exceptionType ??
      "unknown error";
    throw new Error(`Kiro stream exception (${exceptionType}): ${detail}`);
  }

  // Reasoning frames
  if (eventType === "reasoningContentEvent") {
    const text = extractReasoningText(payload);
    if (text) {
      state.outputChars += text.length;
      controller.enqueue({ reasoning: text });
    }
    return false;
  }

  // Assistant content with inline thinking
  if (eventType === "assistantResponseEvent" && payload) {
    const rawContent = (payload.content as string) ?? "";
    if (rawContent) {
      splitInlineThinking(
        state.thinkingState,
        rawContent,
        (s) => {
          state.outputChars += s.length;
          controller.enqueue({ delta: s });
        },
        (s) => {
          state.outputChars += s.length;
          controller.enqueue({ reasoning: s });
        },
      );
    }
    return false;
  }

  // Code events carry plain content
  if (eventType === "codeEvent" && typeof payload?.content === "string") {
    if (payload.content) {
      state.outputChars += payload.content.length;
      controller.enqueue({ delta: payload.content });
    }
    return false;
  }

  // Tool use events
  if (eventType === "toolUseEvent" && payload) {
    const uses = Array.isArray(payload) ? payload : [payload];

    for (const use of uses as Array<Record<string, unknown>>) {
      const toolUseId = (use.toolUseId as string) ?? `tc_${Date.now()}`;
      const name = (use.name as string) ?? "";
      const input = use.input;

      if (!state.startedTools.has(toolUseId)) {
        state.startedTools.add(toolUseId);
        controller.enqueue({
          toolCallStart: { toolCallId: toolUseId, toolName: name },
        });
      }

      if (typeof input === "string") {
        if (input) {
          state.emittedToolArgs.set(
            toolUseId,
            (state.emittedToolArgs.get(toolUseId) ?? "") + input,
          );
          controller.enqueue({
            toolCallDelta: { toolCallId: toolUseId, arguments: input },
          });
        }
      } else if (input !== null && typeof input === "object") {
        state.bufferedObjectArgs.set(toolUseId, JSON.stringify(input));
      }

      if (use.stop === true) flushBufferedToolArgs(state, controller);
    }
    return false;
  }

  // Token usage events — `metricsEvent`/`usageEvent` are the only frames that
  // carry real token counts.
  if (eventType === "metricsEvent" || eventType === "usageEvent") {
    const usage = parseKiroTokenUsage(eventType, payload);
    if (usage) {
      state.usage = usage;
      if (KIRO_DEBUG) {
        console.log("[kiro] token usage", JSON.stringify(usage));
      }
    }
    return false;
  }

  // Terminal frames — these end the turn
  if (eventType === "meteringEvent") {
    // Kiro meters credits (`usage` + `unit`), not tokens — never read this as
    // a token count (see usage.ts).
    const metering = parseKiroMetering(payload);
    if (metering && KIRO_DEBUG) {
      console.log("[kiro] meteringEvent", JSON.stringify(metering));
    }
    flushBufferedToolArgs(state, controller);
    state.stopSeen = true;
    return true;
  }

  if (
    eventType === "messageStopEvent" ||
    eventType === "done" ||
    payload?.messageStopEvent !== undefined
  ) {
    flushBufferedToolArgs(state, controller);
    state.stopSeen = true;
    return true;
  }

  // metadataEvent is the reliable terminal marker (always present in trailers).
  if (eventType === "metadataEvent") {
    flushBufferedToolArgs(state, controller);
    state.stopSeen = true;
    return true;
  }

  if (eventType === "contextUsageEvent" && payload) {
    const pct = Number(payload.contextUsagePercentage);
    if (Number.isFinite(pct)) state.contextUsagePercentage = pct;
    return false;
  }

  // Trailer frames with no content — consume silently
  if (eventType === "followupPromptEvent") {
    return false;
  }

  return false;
}

/**
 * Drains every complete frame currently buffered in the queue.
 * Returns true if any frame was terminal.
 */
function drainQueue(state: StreamState, controller: Ctl): boolean {
  let terminal = false;

  while (state.queue.length >= 4) {
    const totalLength = state.queue.peekUint32BE(0);
    if (totalLength === null || state.queue.length < totalLength) break;

    const frameData = state.queue.read(totalLength);
    if (!frameData) break;

    const frame = parseEventFrame(frameData);
    if (!frame) {
      if (KIRO_DEBUG) console.log("[kiro] frame parse failed");
      continue;
    }

    if (KIRO_DEBUG) {
      console.log("[kiro] frame", JSON.stringify(frame.headers));
    }

    if (handleFrame(state, frame, controller)) terminal = true;
  }

  return terminal;
}

/** Emits trailing thinking text, buffered tool args, and the finish chunk. */
function finish(
  state: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  controller: Ctl,
  contextWindow: number,
): void {
  flushPendingThinking(
    state.thinkingState,
    (s) => controller.enqueue({ delta: s }),
    (s) => controller.enqueue({ reasoning: s }),
  );
  flushBufferedToolArgs(state, controller);

  // Kiro often omits token data entirely; fall back to an estimate from the
  // context-usage percentage and emitted characters (see usage.ts).
  const usage =
    state.usage.inputTokens > 0 || state.usage.outputTokens > 0
      ? state.usage
      : estimateKiroUsage(
          state.contextUsagePercentage,
          state.outputChars,
          contextWindow,
        );

  controller.enqueue({
    delta: "",
    finishReason: state.startedTools.size > 0 ? "tool_call" : "stop",
    usage,
  });

  state.closed = true;
  controller.close();
  reader?.cancel().catch(() => {});
}

/**
 * Creates a ReadableStream that parses Kiro's binary EventStream frames.
 * `contextWindow` is used for the token-usage fallback estimate.
 */
export function createKiroStream(
  res: Response,
  contextWindow = 200_000,
): ReadableStream<CanonicalStreamChunk> {
  const reader = res.body?.getReader();

  const state: StreamState = {
    queue: new ByteQueue(),
    thinkingState: { thinkingMode: false, pendingTag: "" },
    usage: { inputTokens: 0, outputTokens: 0 },
    contextUsagePercentage: 0,
    outputChars: 0,
    closed: false,
    stopSeen: false,
    startedTools: new Set(),
    bufferedObjectArgs: new Map(),
    emittedToolArgs: new Map(),
  };

  if (KIRO_DEBUG) {
    console.log("[kiro] stream opened", res.status);
  }

  return new ReadableStream<CanonicalStreamChunk>({
    async pull(controller) {
      if (state.closed) return;

      if (!reader) {
        state.closed = true;
        controller.close();
        return;
      }

      const { done, value } = await reader.read();
      if (value) state.queue.push(value);

      if (KIRO_DEBUG) {
        console.log(
          `[kiro] read done=${done} bytes=${value?.length ?? 0} queued=${state.queue.length}`,
        );
      }

      if (drainQueue(state, controller) || state.stopSeen) {
        if (KIRO_DEBUG) console.log("[kiro] finishing on stop signal");
        finish(state, reader, controller, contextWindow);
        return;
      }

      if (done) {
        if (KIRO_DEBUG) {
          console.log(
            `[kiro] finishing on EOF, leftover=${state.queue.length}`,
          );
        }
        finish(state, reader, controller, contextWindow);
      }
    },

    cancel(reason) {
      state.closed = true;
      reader?.cancel(reason).catch(() => {});
    },
  });
}
