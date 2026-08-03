import type {
  ProviderAdapter,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
} from "./types";

function buildAnthropicMessages(req: CanonicalRequest): { system?: string; messages: unknown[] } {
  let system: string | undefined;
  const messages: unknown[] = [];

  for (const m of req.messages) {
    if (m.role === "system") {
      system = m.content.filter((p) => p.type === "text").map((p) => (p as { type: "text"; text: string }).text).join("\n");
      continue;
    }

    const blocks: unknown[] = [];

    for (const part of m.content) {
      if (part.type === "text") {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "tool_call") {
        blocks.push({
          type: "tool_use",
          id: part.id,
          name: part.name,
          input: typeof part.arguments === "string" ? JSON.parse(part.arguments) : part.arguments,
        });
      } else if (part.type === "tool_result") {
        blocks.push({
          type: "tool_result",
          tool_use_id: part.toolCallId,
          content: part.content,
        });
      }
    }

    if (blocks.length === 1 && (blocks[0] as { type: string }).type === "text") {
      messages.push({ role: m.role, content: (blocks[0] as { type: "text"; text: string }).text });
    } else if (blocks.length > 0) {
      messages.push({ role: m.role, content: blocks });
    }
  }

  return { system, messages };
}

function parseAnthropicResponse(data: unknown): CanonicalResponse {
  const res = data as {
    content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  const parts: CanonicalContentPart[] = [];
  for (const block of res.content) {
    if (block.type === "text" && block.text) {
      parts.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use" && block.id && block.name) {
      parts.push({ type: "tool_call", id: block.id, name: block.name, arguments: block.input ?? {} });
    }
  }

  const finishMap: Record<string, CanonicalResponse["finishReason"]> = {
    end_turn: "stop",
    max_tokens: "length",
    tool_use: "tool_call",
    stop_sequence: "stop",
  };

  return {
    message: { role: "assistant", content: parts },
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    finishReason: finishMap[res.stop_reason] ?? "stop",
  };
}

export const anthropicAdapter: ProviderAdapter = {
  transport: "anthropic",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const { system, messages } = buildAnthropicMessages(req);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 4096,
      stream: false,
    };

    if (system) body.system = system;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters ?? { type: "object", properties: {} },
      }));
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credential.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    return parseAnthropicResponse(await res.json());
  },

  async sendStream(req, credential, model): Promise<ReadableStream<CanonicalStreamChunk>> {
    const { system, messages } = buildAnthropicMessages(req);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
    };

    if (system) body.system = system;
    if (req.temperature !== undefined) body.temperature = req.temperature;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credential.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
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
          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              controller.enqueue({ delta: parsed.delta.text });
            }

            if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
              const finishMap: Record<string, "stop" | "length" | "tool_call"> = {
                end_turn: "stop",
                max_tokens: "length",
                tool_use: "tool_call",
              };
              controller.enqueue({
                delta: "",
                finishReason: finishMap[parsed.delta.stop_reason] ?? "stop",
              });
            }

            if (parsed.type === "message_delta" && parsed.usage) {
              controller.enqueue({
                delta: "",
                usage: { inputTokens: 0, outputTokens: parsed.usage.output_tokens },
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
