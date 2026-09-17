import { createSSEStream } from "../helpers";
import { carryRetryMeta, fetchWithRetry, providerError } from "../retry";
import type {
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";
import { antigravityConfig } from "./config";
import type { AntigravityCredential } from "./oauth";
import { buildAntigravityPayload } from "./payload";
import { storeThoughtSignature } from "./thought-signature";

const PROVIDER_NAME = "Antigravity";

function buildUrl(baseUrl: string, stream: boolean): string {
  const base = baseUrl.replace(/\/+$/, "");
  const action = stream
    ? "v1internal:streamGenerateContent?alt=sse"
    : "v1internal:generateContent";
  return `${base}/${action}`;
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent":
      antigravityConfig.defaultHeaders?.["User-Agent"] ??
      "antigravity/ide/2.11.0 darwin/arm64",
  };
}

// --- Response parsing (shared by send and sendStream) ---

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name?: string; args?: unknown };
}

interface GeminiResponseShape {
  response?: {
    candidates?: {
      content?: { parts?: GeminiPart[] };
      finishReason?: string;
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Cloud Code wraps the Gemini response in a `response` field, but tolerate a
 * bare Gemini body too — the two shapes differ between API versions.
 */
function unwrap(data: GeminiResponseShape): {
  candidates?: GeminiResponseShape["candidates"];
  usageMetadata?: GeminiResponseShape["usageMetadata"];
} {
  return data.response ?? data;
}

const FINISH_MAP: Record<string, CanonicalResponse["finishReason"]> = {
  STOP: "stop",
  MAX_TOKENS: "length",
  SAFETY: "error",
  RECITATION: "error",
};

function parseResponse(
  data: GeminiResponseShape,
  sessionKey: string,
): CanonicalResponse {
  const { candidates, usageMetadata } = unwrap(data);
  const candidate = candidates?.[0];
  const parts: CanonicalResponse["message"]["content"] = [];
  let functionCallCounter = 0;

  if (candidate?.content?.parts) {
    for (const p of candidate.content.parts) {
      if (p.thought) continue;
      if (p.text) {
        parts.push({ type: "text", text: p.text });
      } else if (p.functionCall?.name) {
        const toolCallId = `fc_${Date.now()}_${functionCallCounter++}`;
        if (p.thoughtSignature) {
          storeThoughtSignature(toolCallId, p.thoughtSignature, sessionKey);
        }
        parts.push({
          type: "tool_call",
          id: toolCallId,
          name: p.functionCall.name,
          arguments: p.functionCall.args ?? {},
          ...(p.thoughtSignature
            ? { thoughtSignature: p.thoughtSignature }
            : {}),
        });
      }
    }
  }

  return {
    message: { role: "assistant", content: parts },
    usage: {
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    },
    finishReason: FINISH_MAP[candidate?.finishReason ?? "STOP"] ?? "stop",
  };
}

const STREAM_FINISH_MAP: Record<string, "stop" | "length"> = {
  STOP: "stop",
  MAX_TOKENS: "length",
};

// --- Adapter ---

const DEFAULT_BASE_URL = antigravityConfig.baseUrl;

export const antigravityAdapter: ProviderAdapter = {
  transport: "antigravity",

  async send(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<CanonicalResponse> {
    const cred = credential as AntigravityCredential;
    const base = baseUrl ?? DEFAULT_BASE_URL;
    const body = buildAntigravityPayload(req, model, {
      projectId: cred.projectId,
      sessionKey: cred.accountId ?? cred.apiKey,
    });

    const res = await fetchWithRetry(
      buildUrl(base, false),
      {
        method: "POST",
        headers: buildHeaders(cred.apiKey),
        body: JSON.stringify(body),
      },
      { providerName: PROVIDER_NAME, retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError(PROVIDER_NAME, res, text);
    }

    const sessionKey = cred.accountId ?? cred.apiKey;
    const data = (await res.json()) as GeminiResponseShape;
    return carryRetryMeta(parseResponse(data, sessionKey), data);
  },

  async sendStream(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const cred = credential as AntigravityCredential;
    const base = baseUrl ?? DEFAULT_BASE_URL;
    const body = buildAntigravityPayload(req, model, {
      projectId: cred.projectId,
      sessionKey: cred.accountId ?? cred.apiKey,
    });

    const res = await fetchWithRetry(
      buildUrl(base, true),
      {
        method: "POST",
        headers: buildHeaders(cred.apiKey),
        body: JSON.stringify(body),
      },
      { providerName: PROVIDER_NAME, retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError(PROVIDER_NAME, res, text);
    }

    const sessionKey = cred.accountId ?? cred.apiKey;
    let functionCallCounter = 0;

    return carryRetryMeta(
      createSSEStream(res, (parsed, controller) => {
        const { candidates, usageMetadata } = unwrap(
          parsed as unknown as GeminiResponseShape,
        );
        const candidate = candidates?.[0];
        const parts = candidate?.content?.parts ?? [];

        for (const part of parts) {
          if (part.thought === true) {
            if (part.text) controller.enqueue({ reasoning: part.text });
            continue;
          }
          if (typeof part.text === "string" && part.text) {
            controller.enqueue({ delta: part.text });
          }
          if (part.functionCall?.name) {
            const toolCallId = `fc_${Date.now()}_${functionCallCounter++}`;
            const thoughtSignature = part.thoughtSignature;
            if (thoughtSignature) {
              storeThoughtSignature(toolCallId, thoughtSignature, sessionKey);
            }
            controller.enqueue({
              toolCallStart: {
                toolCallId,
                toolName: part.functionCall.name,
                ...(thoughtSignature ? { thoughtSignature } : {}),
              },
            });
            controller.enqueue({
              toolCallDelta: {
                toolCallId,
                arguments: JSON.stringify(part.functionCall.args ?? {}),
              },
            });
          }
        }

        if (candidate?.finishReason) {
          controller.enqueue({
            delta: "",
            finishReason:
              STREAM_FINISH_MAP[candidate.finishReason as string] ?? "stop",
          });
        }

        if (usageMetadata) {
          controller.enqueue({
            delta: "",
            usage: {
              inputTokens: usageMetadata.promptTokenCount ?? 0,
              outputTokens: usageMetadata.candidatesTokenCount ?? 0,
            },
          });
        }
      }),
      res,
    );
  },
};
