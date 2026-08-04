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
  let systemInstruction: unknown;
  const contents: unknown[] = [];

  for (const m of req.messages) {
    if (m.role === "system") {
      systemInstruction = {
        parts: m.content
          .filter((p) => p.type === "text")
          .map((p) => ({ text: (p as { type: "text"; text: string }).text })),
      };
      continue;
    }

    const parts: unknown[] = [];
    for (const part of m.content) {
      if (part.type === "text") {
        parts.push({ text: part.text });
      } else if (part.type === "tool_call") {
        parts.push({
          functionCall: {
            name: part.name,
            args:
              typeof part.arguments === "string"
                ? JSON.parse(part.arguments)
                : part.arguments,
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

  if (candidate?.content?.parts) {
    for (const p of candidate.content.parts) {
      if (p.text) {
        parts.push({ type: "text", text: p.text });
      } else if (p.functionCall) {
        parts.push({
          type: "tool_call",
          id: `func_${Date.now()}`,
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

export const geminiAdapter: ProviderAdapter = {
  transport: "gemini",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const { systemInstruction, contents } = buildGeminiContents(req);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature,
      },
    };

    if (systemInstruction) body.systemInstruction = systemInstruction;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${credential.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }

    return parseGeminiResponse(await res.json());
  },

  async sendStream(
    req,
    credential,
    model,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const { systemInstruction, contents } = buildGeminiContents(req);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature,
      },
    };

    if (systemInstruction) body.systemInstruction = systemInstruction;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${credential.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream({
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
          try {
            const parsed = JSON.parse(data);
            const candidate = parsed.candidates?.[0];
            const part = candidate?.content?.parts?.[0];

            if (part?.text) {
              controller.enqueue({ delta: part.text });
            }

            if (candidate?.finishReason) {
              const finishMap: Record<string, "stop" | "length"> = {
                STOP: "stop",
                MAX_TOKENS: "length",
              };
              controller.enqueue({
                delta: "",
                finishReason: finishMap[candidate.finishReason] ?? "stop",
              });
            }

            if (parsed.usageMetadata) {
              controller.enqueue({
                delta: "",
                usage: {
                  inputTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                  outputTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                },
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      },
    });
  },
};
