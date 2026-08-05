import { createHash, randomUUID } from "node:crypto";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  CanonicalToolDefinition,
  ProviderAdapter,
} from "../types";
import { ByteQueue, parseEventFrame } from "./eventstream";
import {
  flushPendingThinking,
  type KiroThinkingState,
  splitInlineThinking,
} from "./thinking";

// --- Request Translation: OpenAI -> Kiro ---

interface KiroToolResult {
  toolUseId: string;
  status: string;
  content: Array<{ text: string }>;
}

interface KiroMessageContext {
  toolResults?: KiroToolResult[];
  tools?: Record<string, unknown>[];
}

interface KiroMessage {
  userInputMessage?: {
    content: string;
    modelId: string;
    origin: string;
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

function normalizeModelId(model: string): string {
  // claude-sonnet-4-5 -> claude-sonnet-4.5 (dash to dot for version)
  return model.replace(/-(\d)-(\d)/g, ".$1.$2");
}

/**
 * Set KIRO_DEBUG=1 to log every upstream eventstream frame. Diagnostic only —
 * the Kiro wire protocol is undocumented, so the frame log is the only reliable
 * way to see why a turn never terminates.
 */
const KIRO_DEBUG = process.env.KIRO_DEBUG === "1";

function wrapSystemMessage(content: string): string {
  return `[Context: System instructions]\n\n<system-reminder>\n${content}\n</system-reminder>`;
}

/** Max tool-name length Kiro accepts before it rejects the request. */
const MAX_TOOL_NAME_LENGTH = 64;

/**
 * JSON-Schema keywords Kiro/CodeWhisperer rejects anywhere in a tool schema.
 * Their presence yields HTTP 400 "Improperly formed request".
 */
const SCHEMA_STRIP_KEYS = new Set([
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

/** Recursively drops unsupported schema keys and empty `required` arrays. */
function stripSchemaKeys(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSchemaKeys);

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SCHEMA_STRIP_KEYS.has(key)) continue;
    if (key === "required" && Array.isArray(val) && val.length === 0) continue;
    cleaned[key] = stripSchemaKeys(val);
  }
  return cleaned;
}

/**
 * Serializes tool-result content for Kiro. An empty string is rejected with
 * 400 "Improperly formed request", so it degrades to a placeholder instead.
 */
function serializeToolResultContent(content: unknown): string {
  if (typeof content === "string") return content || "(no output)";
  if (content === null || content === undefined) return "(no output)";
  try {
    return JSON.stringify(content) || "(no output)";
  } catch {
    return "(no output)";
  }
}

function convertTools(
  tools: CanonicalToolDefinition[],
): Record<string, unknown>[] {
  return tools.map((t) => {
    // Kiro rejects tool names longer than 64 chars; hash-truncate to stay
    // deterministic so the same tool always maps to the same wire name.
    let name = t.name;
    if (name.length > MAX_TOOL_NAME_LENGTH) {
      const hash = createHash("sha256").update(name).digest("hex").slice(0, 7);
      name = `${name.slice(0, 56)}_${hash}`;
    }

    const raw = t.parameters;
    const schema =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (stripSchemaKeys(raw) as Record<string, unknown>)
        : { type: "object", properties: {} };

    // Kiro expects the `required` key to be present on the top-level schema.
    if (!schema.required) schema.required = [];

    return {
      toolSpecification: {
        name,
        description: t.description || `Tool: ${t.name}`,
        inputSchema: { json: schema },
      },
    };
  });
}

function buildKiroPayload(
  req: CanonicalRequest,
  model: string,
): Record<string, unknown> {
  const normalizedModel = normalizeModelId(model);
  const history: KiroMessage[] = [];

  const kiroTools =
    req.tools && req.tools.length > 0 ? convertTools(req.tools) : null;

  // Process messages into Kiro format
  let systemContent = "";
  // Kiro requires `content` to be an array of text blocks. A bare string (or
  // [{ text: "" }]) is rejected with 400 "Improperly formed request".
  const pendingToolResults: KiroToolResult[] = [];

  for (const msg of req.messages) {
    // Collect system messages
    if (msg.role === "system") {
      systemContent = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");
      continue;
    }

    // Collect tool results
    if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type === "tool_result") {
          pendingToolResults.push({
            toolUseId: part.toolCallId,
            status: "success",
            content: [{ text: serializeToolResultContent(part.content) }],
          });
        }
      }
      continue;
    }

    // User message
    if (msg.role === "user") {
      // The Anthropic format carries tool_result blocks on user messages, so
      // collect them here too or they are silently dropped.
      for (const part of msg.content) {
        if (part.type === "tool_result") {
          pendingToolResults.push({
            toolUseId: part.toolCallId,
            status: "success",
            content: [{ text: serializeToolResultContent(part.content) }],
          });
        }
      }

      let content = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");

      if (systemContent) {
        content = `${wrapSystemMessage(systemContent)}\n\n${content}`;
        systemContent = "";
      }

      const userMsg: KiroMessage = {
        userInputMessage: {
          content,
          modelId: normalizedModel,
          origin: "AI_EDITOR",
        },
      };

      if (pendingToolResults.length > 0 && userMsg.userInputMessage) {
        userMsg.userInputMessage.userInputMessageContext = {
          toolResults: pendingToolResults.splice(0),
        };
      }

      history.push(userMsg);
      continue;
    }

    // Assistant message
    if (msg.role === "assistant") {
      const content = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");

      const assistantMsg: KiroMessage = {
        assistantResponseMessage: {
          content: content || "(empty)",
        },
      };

      // Collect tool uses
      const toolUses = msg.content
        .filter((p) => p.type === "tool_call")
        .map((p) => {
          const tc = p as {
            type: "tool_call";
            id: string;
            name: string;
            arguments: unknown;
          };
          return {
            toolUseId: tc.id,
            name: tc.name,
            input:
              typeof tc.arguments === "string"
                ? JSON.parse(tc.arguments)
                : tc.arguments,
          };
        });

      if (toolUses.length > 0) {
        (
          assistantMsg.assistantResponseMessage as Record<string, unknown>
        ).toolUses = toolUses;
      }

      history.push(assistantMsg);
    }
  }

  // Trailing tool results with no following user turn become their own turn.
  if (pendingToolResults.length > 0) {
    const text = pendingToolResults
      .flatMap((r) => r.content.map((c) => c.text))
      .join("\n\n");

    history.push({
      userInputMessage: {
        content: text || "...",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
        userInputMessageContext: { toolResults: pendingToolResults.splice(0) },
      },
    });
  }

  // Kiro requires history to open with a user turn.
  if (history.length > 0 && history[0]?.assistantResponseMessage) {
    history.unshift({
      userInputMessage: {
        content: "(empty)",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
      },
    });
  }

  // Kiro requires strictly alternating user/assistant turns.
  const alternating: KiroMessage[] = [];
  for (const item of history) {
    const last = alternating[alternating.length - 1];
    if (item.userInputMessage && last?.userInputMessage) {
      alternating.push({ assistantResponseMessage: { content: "(empty)" } });
    }
    alternating.push(item);
  }

  // Kiro requires currentMessage to be a user turn. Take the final user turn if
  // the conversation ends with one, otherwise synthesize neutral filler.
  let currentMessage: KiroMessage;
  if (alternating[alternating.length - 1]?.userInputMessage) {
    currentMessage = alternating.pop() as KiroMessage;
  } else {
    currentMessage = {
      userInputMessage: {
        content: "...",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
      },
    };
  }

  // Every toolResults array must be preceded by an assistant turn carrying
  // toolUses. Orphans (truncated history) are inlined as text instead.
  const inlineOrphanedToolResults = (
    msg: KiroMessage | undefined,
    prev: KiroMessage | undefined,
  ) => {
    const ctx = msg?.userInputMessage?.userInputMessageContext;
    if (!ctx?.toolResults) return;
    if ((prev?.assistantResponseMessage?.toolUses?.length ?? 0) > 0) return;

    const text = ctx.toolResults
      .map((tr) => {
        const body = tr.content.map((c) => c.text).join("\n");
        return tr.toolUseId
          ? `[Tool Result (${tr.toolUseId})]\n${body}`
          : `[Tool Result]\n${body}`;
      })
      .join("\n\n");

    const original = msg?.userInputMessage?.content ?? "";
    if (msg?.userInputMessage) {
      msg.userInputMessage.content = original ? `${original}\n\n${text}` : text;
    }
    delete ctx.toolResults;
    if (Object.keys(ctx).length === 0) {
      delete msg?.userInputMessage?.userInputMessageContext;
    }
  };

  alternating.forEach((item, i) => {
    inlineOrphanedToolResults(item, alternating[i - 1]);
  });
  inlineOrphanedToolResults(
    currentMessage,
    alternating[alternating.length - 1],
  );

  // Kiro rejects history referencing toolUses without a tools schema. When the
  // caller sent none, synthesize minimal specs from the names used in history
  // so the tool-call context survives instead of 400-ing.
  let toolsForRequest = kiroTools;
  if (!toolsForRequest) {
    const seen = new Set<string>();
    const synthesized: Record<string, unknown>[] = [];
    for (const item of [...alternating, currentMessage]) {
      for (const use of item.assistantResponseMessage?.toolUses ?? []) {
        if (!use.name || seen.has(use.name)) continue;
        seen.add(use.name);
        synthesized.push({
          toolSpecification: {
            name: use.name,
            description: `Tool: ${use.name}`,
            inputSchema: {
              json: { type: "object", properties: {}, required: [] },
            },
          },
        });
      }
    }
    if (synthesized.length > 0) toolsForRequest = synthesized;
  }

  // The tools schema belongs on currentMessage only — Kiro validates history
  // against it there, and rejects the request when it rides a history turn.
  if (toolsForRequest && currentMessage.userInputMessage) {
    currentMessage.userInputMessage.userInputMessageContext = {
      ...(currentMessage.userInputMessage.userInputMessageContext ?? {}),
      tools: toolsForRequest,
    };
  }

  for (const item of alternating) {
    const ctx = item.userInputMessage?.userInputMessageContext;
    if (!ctx) continue;
    delete ctx.tools;
    if (Object.keys(ctx).length === 0) {
      delete item.userInputMessage?.userInputMessageContext;
    }
  }

  // Build the final payload
  const payload: Record<string, unknown> = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: randomUUID(),
      currentMessage,
      history: alternating,
    },
    inferenceConfig: {
      maxTokens: req.maxTokens ?? 4096,
    },
  };

  if (req.temperature !== undefined) {
    (payload.inferenceConfig as Record<string, unknown>).temperature =
      req.temperature;
  }

  return payload;
}

// --- KiroAdapter ---

export const kiroAdapter: ProviderAdapter = {
  transport: "kiro",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const url =
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";

    const body = buildKiroPayload(req, model);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.amazon.eventstream",
        "X-Amz-Target":
          "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
        "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
        "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
        "Amz-Sdk-Request": "attempt=1; max=3",
        "Amz-Sdk-Invocation-Id": randomUUID(),
        "x-amzn-bedrock-cache-control": "enable",
        tokentype: "API_KEY",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kiro API error ${res.status}: ${text}`);
    }

    // Read the full binary response and parse all frames
    const arrayBuffer = await res.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    let content = "";
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: unknown;
    }> = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finishReason: CanonicalResponse["finishReason"] = "stop";

    let offset = 0;
    while (offset < data.length) {
      if (offset + 4 > data.length) break;

      const totalLength = new DataView(
        data.buffer,
        data.byteOffset,
        data.length,
      ).getUint32(offset, false);
      if (totalLength < 16 || offset + totalLength > data.length) break;

      const frameData = data.subarray(offset, offset + totalLength);
      const frame = parseEventFrame(frameData);
      offset += totalLength;

      if (!frame) continue;

      const eventType = frame.headers[":event-type"];

      if (eventType === "assistantResponseEvent" && frame.payload) {
        content = (frame.payload.content as string) ?? "";
      }

      if (eventType === "toolUseEvent" && frame.payload) {
        toolCalls.push({
          id: (frame.payload.toolUseId as string) ?? `tc_${Date.now()}`,
          name: (frame.payload.name as string) ?? "",
          arguments: frame.payload.input ?? {},
        });
      }

      if (eventType === "metricsEvent" && frame.payload) {
        usage = {
          inputTokens: (frame.payload.inputTokens as number) ?? 0,
          outputTokens: (frame.payload.outputTokens as number) ?? 0,
        };
      }

      if (eventType === "messageStopEvent") {
        finishReason = toolCalls.length > 0 ? "tool_call" : "stop";
      }
    }

    const parts: CanonicalContentPart[] = [];
    if (content) parts.push({ type: "text", text: content });
    for (const tc of toolCalls) {
      parts.push({
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      });
    }

    return {
      message: { role: "assistant", content: parts },
      usage,
      finishReason,
    };
  },

  async sendStream(
    req,
    credential,
    model,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url =
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";

    const body = buildKiroPayload(req, model);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.amazon.eventstream",
        "X-Amz-Target":
          "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
        "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
        "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
        "Amz-Sdk-Request": "attempt=1; max=3",
        "Amz-Sdk-Invocation-Id": randomUUID(),
        "x-amzn-bedrock-cache-control": "enable",
        tokentype: "API_KEY",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kiro API error ${res.status}: ${text}`);
    }

    if (KIRO_DEBUG) {
      console.log("[kiro] stream opened", res.status);
    }

    const reader = res.body?.getReader();
    const queue = new ByteQueue();
    const thinkingState: KiroThinkingState = {
      thinkingMode: false,
      pendingTag: "",
    };
    let usage = { inputTokens: 0, outputTokens: 0 };
    let closed = false;
    let stopSeen = false;

    // Tool-call bookkeeping. Kiro reports `input` in two shapes:
    //   - string  -> incremental JSON *fragments*, safe to forward as they arrive
    //   - object  -> a *partial object that grows*, so each frame supersedes the
    //                previous one. Forwarding every object concatenates
    //                overlapping JSON prefixes into unparseable garbage, so the
    //                latest canonical form is buffered and flushed once at the end.
    const startedTools = new Set<string>();
    const bufferedObjectArgs = new Map<string, string>();
    // Tracks what has already been sent per tool call so a flush cannot emit
    // the same arguments twice (stop frame followed by messageStopEvent).
    const emittedToolArgs = new Map<string, string>();

    type Ctl = ReadableStreamDefaultController<CanonicalStreamChunk>;

    /** Emits buffered object-form tool arguments, skipping anything already sent. */
    function flushBufferedToolArgs(controller: Ctl) {
      if (bufferedObjectArgs.size === 0) return;
      for (const [toolCallId, canonical] of bufferedObjectArgs) {
        if (canonical && canonical !== emittedToolArgs.get(toolCallId)) {
          controller.enqueue({
            toolCallDelta: { toolCallId, arguments: canonical },
          });
          emittedToolArgs.set(toolCallId, canonical);
        }
      }
      bufferedObjectArgs.clear();
    }

    /** Processes one decoded frame. Returns true when the turn is complete. */
    function handleFrame(
      frame: NonNullable<ReturnType<typeof parseEventFrame>>,
      controller: Ctl,
    ): boolean {
      const eventType = frame.headers[":event-type"] ?? "";
      const payload = frame.payload;

      // An upstream exception frame ends the turn. AWS signals these via the
      // :message-type / :exception-type headers rather than an event name, and
      // does not follow them with messageStopEvent — so without this the
      // request hangs waiting for a stop that never arrives.
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

      // Reasoning frames carry `reasoningText` as either a string or
      // `{ text }`, or fall back to a flat `text` depending on the model.
      if (eventType === "reasoningContentEvent" && payload) {
        const rt = payload.reasoningText;
        let text = "";
        if (typeof rt === "string") {
          text = rt;
        } else if (rt && typeof rt === "object") {
          const o = rt as { text?: unknown; Text?: unknown };
          text =
            typeof o.text === "string"
              ? o.text
              : typeof o.Text === "string"
                ? o.Text
                : "";
        } else if (typeof payload.text === "string") {
          text = payload.text;
        }
        if (text) controller.enqueue({ reasoning: text });
        return false;
      }

      if (eventType === "assistantResponseEvent" && payload) {
        const rawContent = (payload.content as string) ?? "";
        if (rawContent) {
          splitInlineThinking(
            thinkingState,
            rawContent,
            (s) => controller.enqueue({ delta: s }),
            (s) => controller.enqueue({ reasoning: s }),
          );
        }
        return false;
      }

      // codeEvent carries plain content, same channel as assistant text.
      if (eventType === "codeEvent" && typeof payload?.content === "string") {
        if (payload.content) controller.enqueue({ delta: payload.content });
        return false;
      }

      if (eventType === "toolUseEvent" && payload) {
        // A single frame may carry one tool use or an array of them.
        const uses = Array.isArray(payload) ? payload : [payload];

        for (const use of uses as Array<Record<string, unknown>>) {
          const toolUseId = (use.toolUseId as string) ?? `tc_${Date.now()}`;
          const name = (use.name as string) ?? "";
          const input = use.input;

          if (!startedTools.has(toolUseId)) {
            startedTools.add(toolUseId);
            controller.enqueue({
              toolCallStart: { toolCallId: toolUseId, toolName: name },
            });
          }

          if (typeof input === "string") {
            // String payloads are concatenable incremental deltas.
            if (input) {
              emittedToolArgs.set(
                toolUseId,
                (emittedToolArgs.get(toolUseId) ?? "") + input,
              );
              controller.enqueue({
                toolCallDelta: { toolCallId: toolUseId, arguments: input },
              });
            }
          } else if (input !== null && typeof input === "object") {
            bufferedObjectArgs.set(toolUseId, JSON.stringify(input));
          }

          // A frame flagged `stop` closes just this tool call, not the turn.
          if (use.stop === true) flushBufferedToolArgs(controller);
        }
        return false;
      }

      if (eventType === "metricsEvent" && payload) {
        // Metrics may be nested under `metricsEvent` or sit at the top level.
        const m = (payload.metricsEvent ?? payload) as Record<string, unknown>;
        const inputTokens =
          typeof m.inputTokens === "number" ? m.inputTokens : 0;
        const outputTokens =
          typeof m.outputTokens === "number" ? m.outputTokens : 0;
        if (inputTokens > 0 || outputTokens > 0) {
          usage = { inputTokens, outputTokens };
        }
        return false;
      }

      // usageEvent is an alternative token-accounting frame.
      if (eventType === "usageEvent" && payload) {
        const u = (payload.usageEvent ?? payload) as Record<string, unknown>;
        const inputTokens =
          typeof u.inputTokens === "number" ? u.inputTokens : 0;
        const outputTokens =
          typeof u.outputTokens === "number" ? u.outputTokens : 0;
        if (inputTokens > 0 || outputTokens > 0) {
          usage = { inputTokens, outputTokens };
        }
        return false;
      }

      // meteringEvent closes the trailer and may carry token counts.
      if (eventType === "meteringEvent") {
        const m = (payload?.meteringEvent ?? payload ?? {}) as Record<
          string,
          unknown
        >;
        const inputTokens =
          typeof m.inputTokens === "number" ? m.inputTokens : 0;
        const outputTokens =
          typeof m.outputTokens === "number" ? m.outputTokens : 0;
        if (inputTokens > 0 || outputTokens > 0) {
          usage = { inputTokens, outputTokens };
        }
        flushBufferedToolArgs(controller);
        stopSeen = true;
        return true;
      }

      // AWS keeps the connection open after the turn ends, so a frame — not
      // EOF — is what terminates the stream. Without it the request hangs.
      if (
        eventType === "messageStopEvent" ||
        eventType === "done" ||
        payload?.messageStopEvent !== undefined
      ) {
        flushBufferedToolArgs(controller);
        stopSeen = true;
        return true;
      }

      // `messageStopEvent` is the documented terminator but, verified against
      // live Kiro (2026-08), it is frequently never sent. A turn instead ends
      // with a trailer and the socket is held open. Observed trailers:
      //   metadataEvent -> contextUsageEvent -> meteringEvent -> EOF
      //   metadataEvent -> contextUsageEvent -> meteringEvent (socket open)
      //   metadataEvent -> contextUsageEvent            (socket open)
      // meteringEvent is therefore optional; metadataEvent is the only frame
      // present in every trailer, so it is the reliable terminal marker.
      //
      // Returning true here still drains the rest of the current read first
      // (see drainQueue), so a meteringEvent batched in the same chunk is not
      // lost and its token counts are recorded.
      if (eventType === "metadataEvent") {
        flushBufferedToolArgs(controller);
        stopSeen = true;
        return true;
      }

      // Remaining trailer frames carry no assistant content — consume them so
      // they never fall through to a content handler.
      if (
        eventType === "contextUsageEvent" ||
        eventType === "followupPromptEvent"
      ) {
        return false;
      }

      return false;
    }

    /**
     * Drains every complete frame currently buffered in the queue.
     *
     * A terminal frame does not stop the loop: the trailer usually arrives as
     * one read, so a `meteringEvent` batched after `metadataEvent` must still be
     * processed for its token counts. Returns true if any frame was terminal.
     */
    function drainQueue(controller: Ctl): boolean {
      let terminal = false;

      while (queue.length >= 4) {
        const totalLength = queue.peekUint32BE(0);
        if (totalLength === null || queue.length < totalLength) break;

        const frameData = queue.read(totalLength);
        if (!frameData) break;

        const frame = parseEventFrame(frameData);
        if (!frame) {
          if (KIRO_DEBUG) console.log("[kiro] frame parse failed");
          continue;
        }

        if (KIRO_DEBUG) {
          console.log("[kiro] frame", JSON.stringify(frame.headers));
        }

        if (handleFrame(frame, controller)) terminal = true;
      }

      return terminal;
    }

    /** Emits trailing thinking text, buffered tool args, and the finish chunk. */
    function finish(controller: Ctl) {
      flushPendingThinking(
        thinkingState,
        (s) => controller.enqueue({ delta: s }),
        (s) => controller.enqueue({ reasoning: s }),
      );
      flushBufferedToolArgs(controller);

      controller.enqueue({
        delta: "",
        finishReason: startedTools.size > 0 ? "tool_call" : "stop",
        usage,
      });

      closed = true;
      controller.close();
      // Release the upstream socket; AWS does not close it for us.
      reader?.cancel().catch(() => {});
    }

    return new ReadableStream<CanonicalStreamChunk>({
      async pull(controller) {
        if (closed) return;

        if (!reader) {
          closed = true;
          controller.close();
          return;
        }

        const { done, value } = await reader.read();
        if (value) queue.push(value);

        if (KIRO_DEBUG) {
          console.log(
            `[kiro] read done=${done} bytes=${value?.length ?? 0} queued=${queue.length}`,
          );
        }

        if (drainQueue(controller) || stopSeen) {
          if (KIRO_DEBUG) console.log("[kiro] finishing on stop signal");
          finish(controller);
          return;
        }

        // EOF without a stop event: leftover bytes cannot form a frame, so
        // terminate rather than waiting for data that will never arrive.
        if (done) {
          if (KIRO_DEBUG) {
            console.log(`[kiro] finishing on EOF, leftover=${queue.length}`);
          }
          finish(controller);
        }
      },

      cancel(reason) {
        closed = true;
        reader?.cancel(reason).catch(() => {});
      },
    });
  },
};
