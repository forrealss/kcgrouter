import {
  createSSEStream,
  extractSystemText,
  parseToolArguments,
} from "../helpers";
import { carryRetryMeta, fetchWithRetry, providerError } from "../retry";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";

function buildGeminiContents(req: CanonicalRequest): {
  systemInstruction?: unknown;
  contents: unknown[];
} {
  const system = extractSystemText(req);
  const systemInstruction = system
    ? {
        parts: system.split("\n").map((text) => ({ text })),
      }
    : undefined;

  const contents: unknown[] = [];

  for (const m of req.messages) {
    if (m.role === "system") continue;

    const parts: unknown[] = [];
    for (const part of m.content) {
      if (part.type === "text") {
        parts.push({ text: part.text });
      } else if (part.type === "tool_call") {
        parts.push({
          functionCall: {
            name: part.name,
            args: parseToolArguments(part.arguments),
          },
        });
      } else if (part.type === "tool_result") {
        parts.push({
          functionResponse: {
            name: "tool",
            response: { result: part.content },
          },
        });
      }
    }

    if (parts.length > 0) {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts,
      });
    }
  }

  return { systemInstruction, contents };
}

function parseGeminiResponse(data: unknown): CanonicalResponse {
  const res = data as {
    candidates?: {
      content?: {
        parts?: {
          text?: string;
          thought?: boolean;
          functionCall?: { name: string; args: unknown };
        }[];
      };
      finishReason?: string;
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };

  const parts: CanonicalContentPart[] = [];
  const candidate = res.candidates?.[0];
  let functionCallCounter = 0;

  if (candidate?.content?.parts) {
    for (const p of candidate.content.parts) {
      if (p.thought) {
        // Deliberately dropped — canonical responses have no reasoning
        // channel; matches the streaming path and the project-wide policy.
        continue;
      }
      if (p.text) {
        parts.push({ type: "text", text: p.text });
      } else if (p.functionCall) {
        parts.push({
          type: "tool_call",
          id: `fc_${Date.now()}_${functionCallCounter++}`,
          name: p.functionCall.name,
          arguments: p.functionCall.args,
        });
      }
    }
  }

  const finishMap: Record<string, CanonicalResponse["finishReason"]> = {
    STOP: "stop",
    MAX_TOKENS: "length",
    SAFETY: "error",
    RECITATION: "error",
  };

  return {
    message: { role: "assistant", content: parts },
    usage: {
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    },
    finishReason: finishMap[candidate?.finishReason ?? "STOP"] ?? "stop",
  };
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function buildBody(req: CanonicalRequest): Record<string, unknown> {
  const { systemInstruction, contents } = buildGeminiContents(req);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      temperature: req.temperature,
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  return body;
}

const STREAM_FINISH_MAP: Record<string, "stop" | "length"> = {
  STOP: "stop",
  MAX_TOKENS: "length",
};

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

export const geminiAdapter: ProviderAdapter = {
  transport: "gemini",

  async send(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<CanonicalResponse> {
    const base = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const body = buildBody(req);
    const url = `${base}/v1beta/models/${model}:generateContent?key=${credential.apiKey}`;

    const res = await fetchWithRetry(
      url,
      { method: "POST", headers: headers(), body: JSON.stringify(body) },
      { providerName: "Gemini", retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError("Gemini", res, text);
    }

    const data = await res.json();
    return carryRetryMeta(parseGeminiResponse(data), data);
  },

  async sendStream(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const base = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const body = buildBody(req);
    const url = `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${credential.apiKey}`;

    const res = await fetchWithRetry(
      url,
      { method: "POST", headers: headers(), body: JSON.stringify(body) },
      { providerName: "Gemini", retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError("Gemini", res, text);
    }

    // A Gemini SSE chunk can carry several parts — text, thought, and
    // functionCall, sometimes all in one chunk — so every part is processed,
    // not just the first (parts[0]-only dropped function calls entirely).
    let functionCallCounter = 0;

    return carryRetryMeta(
      createSSEStream(res, (parsed, controller) => {
        const candidates = parsed.candidates as
          | Array<Record<string, unknown>>
          | undefined;
        const candidate = candidates?.[0];
        const content = candidate?.content as
          | { parts?: Array<Record<string, unknown>> }
          | undefined;
        const parts = content?.parts ?? [];

        for (const part of parts) {
          if (part.thought === true && typeof part.text === "string") {
            // Thought parts are reasoning, never user-visible content.
            if (part.text) controller.enqueue({ reasoning: part.text });
            continue;
          }

          if (typeof part.text === "string" && part.text) {
            controller.enqueue({ delta: part.text });
          }

          const fc = part.functionCall as
            | { name?: string; args?: unknown }
            | undefined;
          if (fc && typeof fc.name === "string" && fc.name) {
            // Gemini function calls carry no id — synthesize a stable one.
            const toolCallId = `fc_${Date.now()}_${functionCallCounter++}`;
            controller.enqueue({
              toolCallStart: { toolCallId, toolName: fc.name },
            });
            controller.enqueue({
              toolCallDelta: {
                toolCallId,
                arguments: JSON.stringify(fc.args ?? {}),
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

        if (parsed.usageMetadata) {
          const usage = parsed.usageMetadata as {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
          controller.enqueue({
            delta: "",
            usage: {
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
            },
          });
        }
      }),
      res,
    );
  },
};
