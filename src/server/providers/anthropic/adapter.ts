import {
  createSSEStream,
  extractSystemText,
  parseToolArguments,
} from "../helpers";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";

function buildAnthropicMessages(req: CanonicalRequest): {
  system?: string;
  messages: unknown[];
} {
  const system = extractSystemText(req);
  const messages: unknown[] = [];

  for (const m of req.messages) {
    if (m.role === "system") continue;

    const blocks: unknown[] = [];

    for (const part of m.content) {
      if (part.type === "text") {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "tool_call") {
        blocks.push({
          type: "tool_use",
          id: part.id,
          name: part.name,
          input: parseToolArguments(part.arguments),
        });
      } else if (part.type === "tool_result") {
        blocks.push({
          type: "tool_result",
          tool_use_id: part.toolCallId,
          content: part.content,
        });
      }
    }

    if (
      blocks.length === 1 &&
      (blocks[0] as { type: string }).type === "text"
    ) {
      messages.push({
        role: m.role,
        content: (blocks[0] as { type: "text"; text: string }).text,
      });
    } else if (blocks.length > 0) {
      messages.push({ role: m.role, content: blocks });
    }
  }

  return { system, messages };
}

function parseAnthropicResponse(data: unknown): CanonicalResponse {
  const res = data as {
    content: {
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  const parts: CanonicalContentPart[] = [];
  for (const block of res.content) {
    if (block.type === "text" && block.text) {
      parts.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use" && block.id && block.name) {
      parts.push({
        type: "tool_call",
        id: block.id,
        name: block.name,
        arguments: block.input ?? {},
      });
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
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    },
    finishReason: finishMap[res.stop_reason] ?? "stop",
  };
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
}

function headers(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

const STREAM_FINISH_MAP: Record<string, "stop" | "length" | "tool_call"> = {
  end_turn: "stop",
  max_tokens: "length",
  tool_use: "tool_call",
};

export const anthropicAdapter: ProviderAdapter = {
  transport: "anthropic",

  async send(req, credential, model, baseUrl): Promise<CanonicalResponse> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
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

    const res = await fetch(url, {
      method: "POST",
      headers: headers(credential.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    return parseAnthropicResponse(await res.json());
  },

  async sendStream(
    req,
    credential,
    model,
    baseUrl,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const { system, messages } = buildAnthropicMessages(req);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
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

    const res = await fetch(url, {
      method: "POST",
      headers: headers(credential.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    // Anthropic's stream carries input_tokens only in message_start and
    // output_tokens only in message_delta, so merge the two across events.
    // content_block events are correlated by index: tool_use blocks start
    // with an id/name, while input_json_delta fragments reference the index.
    let inputTokens = 0;
    const toolCallIdsByBlockIndex = new Map<number, string>();

    return createSSEStream(res, (parsed, controller) => {
      if (parsed.type === "message_start") {
        const message = parsed.message as { usage?: { input_tokens?: number } };
        const reported = message?.usage?.input_tokens;
        if (typeof reported === "number") inputTokens = reported;
      }

      if (parsed.type === "content_block_start") {
        const block = parsed.content_block as {
          type: string;
          id?: string;
          name?: string;
        };
        const index = parsed.index as number;

        if (block?.type === "tool_use" && block.id && block.name) {
          toolCallIdsByBlockIndex.set(index, block.id);
          controller.enqueue({
            toolCallStart: { toolCallId: block.id, toolName: block.name },
          });
        } else if (block?.type === "thinking") {
          // Empty reasoning chunk opens a thinking block downstream.
          controller.enqueue({ reasoning: "" });
        }
        return;
      }

      if (parsed.type === "content_block_delta") {
        const delta = parsed.delta as {
          type?: string;
          text?: string;
          thinking?: string;
          partial_json?: string;
        };
        const index = parsed.index as number;

        if (delta?.type === "text_delta" && delta.text) {
          controller.enqueue({ delta: delta.text });
        } else if (delta?.type === "thinking_delta" && delta.thinking) {
          controller.enqueue({ reasoning: delta.thinking });
        } else if (delta?.type === "input_json_delta" && delta.partial_json) {
          const toolCallId = toolCallIdsByBlockIndex.get(index);
          if (toolCallId) {
            controller.enqueue({
              toolCallDelta: {
                toolCallId,
                arguments: delta.partial_json,
              },
            });
          }
        }
        return;
      }

      if (parsed.type === "message_delta") {
        const delta = parsed.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) {
          controller.enqueue({
            delta: "",
            finishReason: STREAM_FINISH_MAP[delta.stop_reason] ?? "stop",
          });
        }

        const usage = parsed.usage as { output_tokens?: number } | undefined;
        if (usage) {
          controller.enqueue({
            delta: "",
            usage: {
              inputTokens,
              outputTokens: usage.output_tokens ?? 0,
            },
          });
        }
      }
    });
  },
};
