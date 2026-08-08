/**
 * Qoder adapter for kcgrouter — sends chat requests to Qoder's COSY-signed
 * inference endpoint at api3.qoder.sh (or api2 for job-token traffic), then
 * unwraps Qoder's `{statusCodeValue, body}` SSE envelope into canonical
 * stream chunks.
 *
 * Ported from 9router's executors/qoder.js:
 *   - URL is api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation
 *     with `&Encode=1` so the body can ship through the WAF-bypass encoder.
 *   - Authentication is COSY (RSA + AES + MD5 + Cosy-* headers), not a
 *     static HMAC.
 *   - The request shape Qoder expects is non-trivial (chat_context with
 *     mirrored modelConfig, business block with stable IDs, system text
 *     hoisted out of the messages array).
 *   - The per-model `model_config` block is fetched live from
 *     /algo/api/v2/model/list and cached; sending the wrong block silently
 *     downgrades to a different model upstream.
 */

import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";
import {
  QODER_CHAT_BASE_ALT,
  QODER_CHAT_SIG_PATH,
  QODER_CHAT_URL_ENCODED,
} from "./constants";
import { buildCosyHeaders } from "./cosy";
import { qoderEncodeBody } from "./encoding";
import {
  getQoderModelConfig,
  isQoderJobToken,
  resolveQoderCredentials,
  staticModelConfig,
} from "./model-catalog";
import { buildQoderRequestBody } from "./payload";

const CHAT_TIMEOUT_MS = 120_000;

function truncate(s: string, n: number): string {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || "";
}

function buildChatUrl(accessToken: string): string {
  // Job-token (jt-...) traffic must hit api2.qoder.sh — api3 rejects jt-
  // with "Login expired" (403). PAT/device traffic stays on api3.
  if (isQoderJobToken(accessToken)) {
    return `${QODER_CHAT_BASE_ALT}/algo${QODER_CHAT_SIG_PATH}?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
  }
  return QODER_CHAT_URL_ENCODED;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shared chat execution: resolve credentials, resolve model config, build +
 * encode + sign the payload, POST, and return the raw upstream Response.
 */
async function executeQoderChat(
  req: CanonicalRequest,
  apiKey: string,
  model: string,
): Promise<{ response: Response; qoderKey: string }> {
  const resolved = await resolveQoderCredentials(apiKey);
  if (!resolved.userId) {
    throw new Error(
      "qoder: could not resolve the Qoder user id for this token; check the token or reconnect the account",
    );
  }
  if (!resolved.accessToken) {
    throw new Error(
      "qoder: credential is missing an access token; reconnect the account",
    );
  }

  const qoderKey = String(model || "").replace(/^qoder\//, "");
  let modelConfig = await getQoderModelConfig(apiKey, qoderKey);
  if (!modelConfig) {
    // Last-resort static block for canonical keys when the live catalog is
    // unreachable — better than failing the request outright.
    modelConfig = staticModelConfig(qoderKey);
  }
  if (!modelConfig) {
    throw new Error(
      `qoder: model_config for "${qoderKey}" not yet known (run a model list fetch or check upstream connectivity)`,
    );
  }

  const { payload } = buildQoderRequestBody(
    req,
    model,
    modelConfig,
    resolved.userId,
  );

  const plainBody = Buffer.from(JSON.stringify(payload), "utf8");
  const encodedBodyStr = qoderEncodeBody(plainBody);
  const encodedBodyBuf = Buffer.from(encodedBodyStr, "latin1");

  const url = buildChatUrl(resolved.accessToken);
  const cosyHeaders = buildCosyHeaders(encodedBodyBuf, url, {
    userId: resolved.userId,
    authToken: resolved.accessToken,
    machineId: resolved.machineId,
  });

  const modelSource =
    typeof modelConfig.source === "string" ? modelConfig.source : "system";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Model-Key": qoderKey,
    "X-Model-Source": modelSource,
    // gzip triggers signature validation on Qoder's CDN; force identity.
    "Accept-Encoding": "identity",
    ...cosyHeaders,
  };

  const response = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: encodedBodyBuf },
    CHAT_TIMEOUT_MS,
  );

  return { response, qoderKey };
}

function extractError(res: Response): Promise<string> {
  return res
    .text()
    .then((text) => `Qoder API error ${res.status}: ${text.slice(0, 300)}`)
    .catch(() => `Qoder API error ${res.status}`);
}

// --- SSE envelope → canonical chunks ---

const FINISH_MAP: Record<string, CanonicalStreamChunk["finishReason"]> = {
  stop: "stop",
  length: "length",
  tool_calls: "tool_call",
  content_filter: "error",
};

function emitInnerChunk(
  inner: string,
  idByIndex: Map<number, string>,
  controller: ReadableStreamDefaultController<CanonicalStreamChunk>,
): void {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(inner) as Record<string, unknown>;
  } catch {
    return;
  }

  const choices = parsed.choices as
    | Array<{
        delta?: Record<string, unknown>;
        finish_reason?: string;
      }>
    | undefined;
  const delta = choices?.[0]?.delta;

  if (typeof delta?.content === "string" && delta.content) {
    controller.enqueue({ delta: delta.content });
  }

  if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
    controller.enqueue({ reasoning: delta.reasoning_content });
  }

  if (Array.isArray(delta?.tool_calls)) {
    for (const tc of delta.tool_calls as Array<{
      index?: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>) {
      const idx = tc.index ?? 0;
      if (tc.id && tc.function?.name && !idByIndex.has(idx)) {
        idByIndex.set(idx, tc.id);
        controller.enqueue({
          toolCallStart: { toolCallId: tc.id, toolName: tc.function.name },
        });
      }
      const resolvedId = tc.id || idByIndex.get(idx);
      if (resolvedId && tc.function?.arguments) {
        controller.enqueue({
          toolCallDelta: {
            toolCallId: resolvedId,
            arguments: tc.function.arguments,
          },
        });
      }
    }
  }

  const choice = choices?.[0];
  if (choice?.finish_reason) {
    controller.enqueue({
      delta: "",
      finishReason: FINISH_MAP[choice.finish_reason] ?? "stop",
    });
  }

  if (parsed.usage) {
    const u = parsed.usage as {
      prompt_tokens: number;
      completion_tokens: number;
    };
    controller.enqueue({
      delta: "",
      usage: {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
      },
    });
  }
}

/**
 * Wrap the upstream `{statusCodeValue, body}` SSE envelope into a canonical
 * chunk stream.
 *
 * Each upstream line looks like:
 *   data: {"statusCodeValue":200,"body":"{\"choices\":[{\"delta\":{...}}]}"}
 * The inner body is an OpenAI streaming chunk (or "[DONE]"). Errors become a
 * canonical chunk with an inline message and finishReason "error".
 *
 * Critical: Qoder's SSE often keeps the socket open after the terminal
 * [DONE]/error frame (agent keepalive). On terminal events we cancel the
 * upstream reader and close our stream immediately.
 */
function createQoderStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<CanonicalStreamChunk> {
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEmitted = false;
  const reader = body.getReader();
  const idByIndex = new Map<number, string>();

  const processLine = (
    line: string,
    controller: ReadableStreamDefaultController<CanonicalStreamChunk>,
  ) => {
    const trimmed = line.replace(/\r$/, "").trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("data:")) return;
    if (doneEmitted) return;

    const data = trimmed.slice(5).trimStart();
    if (data === "[DONE]") {
      doneEmitted = true;
      return;
    }

    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    const statusVal =
      typeof envelope.statusCodeValue === "number"
        ? envelope.statusCodeValue
        : 200;
    const inner = typeof envelope.body === "string" ? envelope.body : "";
    if (statusVal !== 200) {
      const msg = inner || `upstream status ${statusVal}`;
      controller.enqueue({
        delta: `\n[qoder error ${statusVal}: ${truncate(msg, 200)}]`,
        finishReason: "error",
      });
      doneEmitted = true;
      return;
    }
    if (!inner) return;
    if (inner === "[DONE]") {
      doneEmitted = true;
      return;
    }
    emitInnerChunk(inner, idByIndex, controller);
  };

  return new ReadableStream<CanonicalStreamChunk>({
    async start(controller) {
      try {
        while (!doneEmitted) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.length > 0) {
              processLine(buffer, controller);
              buffer = "";
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          for (;;) {
            const nl = buffer.indexOf("\n");
            if (nl === -1) break;
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            processLine(line, controller);
            if (doneEmitted) {
              // Terminal frame received — drop upstream keepalive and end.
              await reader.cancel().catch(() => {});
              controller.close();
              return;
            }
          }
        }
      } catch {
        // fall through to terminal chunk + close
      } finally {
        if (!doneEmitted) {
          try {
            controller.enqueue({ delta: "", finishReason: "error" });
            doneEmitted = true;
          } catch {
            // already closed
          }
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
        await reader.cancel().catch(() => {});
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });
}

// --- Canonical response assembly (non-streaming) ---

function assembleResponse(chunks: CanonicalStreamChunk[]): CanonicalResponse {
  let content = "";
  let finishReason: CanonicalResponse["finishReason"] = "stop";
  const usage = { inputTokens: 0, outputTokens: 0 };
  const toolCalls = new Map<
    string,
    { id: string; name: string; arguments: string }
  >();

  for (const chunk of chunks) {
    if (chunk.delta) content += chunk.delta;
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.inputTokens;
      usage.outputTokens = chunk.usage.outputTokens;
    }
    if (chunk.finishReason && chunk.finishReason !== "error") {
      finishReason = chunk.finishReason;
    }
    if (chunk.toolCallStart) {
      toolCalls.set(chunk.toolCallStart.toolCallId, {
        id: chunk.toolCallStart.toolCallId,
        name: chunk.toolCallStart.toolName,
        arguments: "",
      });
    }
    if (chunk.toolCallDelta) {
      const existing = toolCalls.get(chunk.toolCallDelta.toolCallId);
      if (existing) {
        existing.arguments += chunk.toolCallDelta.arguments;
      }
    }
  }

  const parts: CanonicalContentPart[] = [];
  if (content) parts.push({ type: "text", text: content });
  for (const tc of toolCalls.values()) {
    parts.push({
      type: "tool_call",
      id: tc.id,
      name: tc.name,
      arguments: parseToolArguments(tc.arguments),
    });
  }

  return {
    message: { role: "assistant", content: parts },
    usage,
    finishReason,
  };
}

function parseToolArguments(args: string): unknown {
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

// Internal helpers exposed for unit tests (not part of the adapter API).
export { assembleResponse, createQoderStream };

export const qoderAdapter: ProviderAdapter = {
  transport: "qoder",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const { response } = await executeQoderChat(req, credential.apiKey, model);

    if (!response.ok) {
      throw new Error(await extractError(response));
    }
    if (!response.body) {
      throw new Error("Qoder API returned no body");
    }

    // Qoder always streams (payload.stream=true); consume the unwrapped
    // stream fully to assemble the non-streaming response.
    const chunks: CanonicalStreamChunk[] = [];
    const stream = createQoderStream(response.body);
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const failed = chunks.find((c) => c.finishReason === "error");
    if (failed) {
      const text = chunks
        .filter((c) => c.delta)
        .map((c) => c.delta)
        .join("")
        .trim();
      throw new Error(text || "Qoder stream ended with an upstream error");
    }

    return assembleResponse(chunks);
  },

  async sendStream(
    req,
    credential,
    model,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const { response } = await executeQoderChat(req, credential.apiKey, model);

    if (!response.ok) {
      throw new Error(await extractError(response));
    }
    if (!response.body) {
      throw new Error("Qoder API returned no body");
    }

    return createQoderStream(response.body);
  },
};
