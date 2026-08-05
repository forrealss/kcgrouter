import { createSSEStream, fetchJson, parseToolArguments } from "../helpers";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";

function buildOpenAIMessages(req: CanonicalRequest): unknown[] {
  return req.messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role };

    const textParts = m.content.filter((p) => p.type === "text");
    const toolCalls = m.content.filter((p) => p.type === "tool_call");
    const toolResults = m.content.filter((p) => p.type === "tool_result");

    if (textParts.length > 0) {
      msg.content = textParts
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");
    }

    if (toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map((p) => {
        const tc = p as {
          type: "tool_call";
          id: string;
          name: string;
          arguments: unknown;
        };
        return {
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        };
      });
    }

    if (toolResults.length > 0) {
      const tr = toolResults[0] as {
        type: "tool_result";
        toolCallId: string;
        content: string;
      };
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
    choices: {
      message: { role: string; content?: string; tool_calls?: unknown[] };
      finish_reason: string;
    }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = res.choices[0];
  if (!choice) {
    return {
      message: { role: "assistant", content: [] },
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      },
      finishReason: "stop",
    };
  }

  const parts: CanonicalContentPart[] = [];

  if (choice.message.content) {
    parts.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      const t = tc as {
        id: string;
        function: { name: string; arguments: string };
      };
      parts.push({
        type: "tool_call",
        id: t.id,
        name: t.function.name,
        arguments: parseToolArguments(t.function.arguments),
      });
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
    usage: {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    },
    finishReason: finishMap[choice.finish_reason] ?? "stop",
  };
}

function buildToolsParam(
  req: CanonicalRequest,
): Record<string, unknown>[] | undefined {
  if (!req.tools || req.tools.length === 0) return undefined;
  return req.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

const URL = "https://api.openai.com/v1/chat/completions";

function headers(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

const FINISH_MAP: Record<string, CanonicalResponse["finishReason"]> = {
  stop: "stop",
  length: "length",
  tool_calls: "tool_call",
  content_filter: "error",
};

export const openaiAdapter: ProviderAdapter = {
  transport: "openai",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const body = {
      model,
      messages: buildOpenAIMessages(req),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: false,
      ...(buildToolsParam(req) ? { tools: buildToolsParam(req) } : {}),
    };

    const data = await fetchJson(
      URL,
      headers(credential.apiKey),
      body,
      "OpenAI",
    );
    return parseOpenAIResponse(data);
  },

  async sendStream(
    req,
    credential,
    model,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const body = {
      model,
      messages: buildOpenAIMessages(req),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      stream_options: { include_usage: true },
    };

    const res = await fetch(URL, {
      method: "POST",
      headers: headers(credential.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    return createSSEStream(res, (parsed, controller) => {
      const delta = parsed.choices?.[0]?.delta;
      const finish = parsed.choices?.[0]?.finish_reason;

      if (delta?.content) {
        controller.enqueue({ delta: delta.content as string });
      }

      if (finish) {
        controller.enqueue({
          delta: "",
          finishReason: FINISH_MAP[finish as string] ?? "stop",
        });
      }

      if (parsed.usage) {
        const usage = parsed.usage as {
          prompt_tokens: number;
          completion_tokens: number;
        };
        controller.enqueue({
          delta: "",
          usage: {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
          },
        });
      }
    });
  },
};
