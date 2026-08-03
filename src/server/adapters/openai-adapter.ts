import type {
  ProviderAdapter,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
} from "./types";

function buildOpenAIMessages(req: CanonicalRequest): unknown[] {
  return req.messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role };

    const textParts = m.content.filter((p) => p.type === "text");
    const toolCalls = m.content.filter((p) => p.type === "tool_call");
    const toolResults = m.content.filter((p) => p.type === "tool_result");

    if (textParts.length > 0) {
      msg.content = textParts.map((p) => (p as { type: "text"; text: string }).text).join("\n");
    }

    if (toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map((p) => {
        const tc = p as { type: "tool_call"; id: string; name: string; arguments: unknown };
        return {
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        };
      });
    }

    if (toolResults.length > 0) {
      const tr = toolResults[0] as { type: "tool_result"; toolCallId: string; content: string };
      msg.role = "tool";
      msg.tool_call_id = tr.toolCallId;
      msg.content = tr.content;
    }

    if (m.toolCallId && m.role !== "tool") {
      msg.tool_call_id = m.toolCallId;
    }

    return msg;
  });
}

function parseOpenAIResponse(data: unknown): CanonicalResponse {
  const res = data as {
    choices: { message: { role: string; content?: string; tool_calls?: unknown[] }; finish_reason: string }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = res.choices[0];
  const parts: CanonicalContentPart[] = [];

  if (choice.message.content) {
    parts.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      const t = tc as { id: string; function: { name: string; arguments: string } };
      let parsed: unknown;
      try {
        parsed = JSON.parse(t.function.arguments);
      } catch {
        parsed = t.function.arguments;
      }
      parts.push({ type: "tool_call", id: t.id, name: t.function.name, arguments: parsed });
    }
  }

  const finishMap: Record<string, CanonicalResponse["finishReason"]> = {
    stop: "stop",
    length: "length",
    tool_calls: "tool_call",
    content_filter: "error",
  };

  return {
    message: { role: "assistant", content: parts },
    usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
    finishReason: finishMap[choice.finish_reason] ?? "stop",
  };
}

export const openaiAdapter: ProviderAdapter = {
  transport: "openai",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const url = new URL("/chat/completions", "https://api.openai.com/v1").toString();

    const body = {
      model,
      messages: buildOpenAIMessages(req),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: false,
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    return parseOpenAIResponse(await res.json());
  },

  async sendStream(req, credential, model): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url = new URL("/chat/completions", "https://api.openai.com/v1").toString();

    const body = {
      model,
      messages: buildOpenAIMessages(req),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      stream_options: { include_usage: true },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

      const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream({
      async pull(controller) {
        if (!reader) { controller.close(); return; }
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
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const finish = parsed.choices?.[0]?.finish_reason;

            if (delta?.content) {
              controller.enqueue({ delta: delta.content });
            }

            if (finish) {
              controller.enqueue({
                delta: "",
                finishReason: finish === "tool_calls" ? "tool_call" : (finish as "stop" | "length"),
              });
            }

            if (parsed.usage) {
              controller.enqueue({
                delta: "",
                usage: { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens },
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
