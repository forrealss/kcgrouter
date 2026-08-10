import { fetchJson, parseToolArguments } from "../helpers";
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

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

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

function createUpstreamSSEParseTransform(): TransformStream<
  Uint8Array,
  CanonicalStreamChunk
> {
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  // Streaming tool calls: only the first chunk for a given index carries `id`
  // and `function.name`; later argument fragments carry just `index`. Track
  // the id per index so delta chunks can be correlated back to their start.
  const idByIndex = new Map<number, string>();

  function processToolCalls(
    toolCalls: Array<{
      index?: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>,
    controller: TransformStreamDefaultController<CanonicalStreamChunk>,
  ) {
    for (const tc of toolCalls) {
      const idx = tc.index ?? 0;

      if (tc.id && tc.function?.name && !idByIndex.has(idx)) {
        idByIndex.set(idx, tc.id);
        controller.enqueue({
          toolCallStart: { toolCallId: tc.id, toolName: tc.function.name },
        });
      }

      // Continuation chunks carry an empty-string id (not undefined), so `||`
      // is required here — `??` would keep "" and lose the fragment.
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

  function parseLine(
    data: string,
    controller: TransformStreamDefaultController<CanonicalStreamChunk>,
  ) {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const choices = parsed.choices as
      | Array<Record<string, unknown>>
      | undefined;
    const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
    const finish = choices?.[0]?.finish_reason as string | undefined;

    if (delta?.content) {
      // Forward streamed content verbatim. Trimming/normalizing per-chunk
      // collapses the whitespace that separates tokens (chunks are often a
      // single word or a lone space), which fuses words together downstream.
      controller.enqueue({ delta: delta.content as string });
    }

    if (delta?.reasoning_content) {
      controller.enqueue({ reasoning: delta.reasoning_content as string });
    }

    if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
      processToolCalls(
        delta.tool_calls as Array<{
          index?: number;
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>,
        controller,
      );
    }

    if (finish) {
      controller.enqueue({
        delta: "",
        finishReason: FINISH_MAP[finish] ?? "stop",
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
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
        },
      });
    }
  }

  return new TransformStream<Uint8Array, CanonicalStreamChunk>({
    transform(chunk, controller) {
      if (done) return;
      buffer += decoder.decode(chunk, { stream: true });

      let nlIndex = buffer.indexOf("\n");
      while (nlIndex !== -1) {
        const line = buffer.slice(0, nlIndex).trim();
        buffer = buffer.slice(nlIndex + 1);
        nlIndex = buffer.indexOf("\n");

        if (!line) continue;
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          done = true;
          return;
        }

        try {
          parseLine(data, controller);
        } catch {
          // skip malformed lines
        }
      }
    },

    flush(controller) {
      const remaining = buffer.trim();
      if (remaining?.startsWith("data:")) {
        const data = remaining.slice(5).trim();
        if (data !== "[DONE]") {
          try {
            parseLine(data, controller);
          } catch {
            // skip
          }
        }
      }
    },
  });
}

export const openaiAdapter: ProviderAdapter = {
  transport: "openai",

  async send(req, credential, model, baseUrl): Promise<CanonicalResponse> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const body = {
      model,
      messages: buildOpenAIMessages(req),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: false,
      ...(buildToolsParam(req) ? { tools: buildToolsParam(req) } : {}),
    };

    const data = await fetchJson(
      url,
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
    baseUrl,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const body = {
      model,
      messages: buildOpenAIMessages(req),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...(buildToolsParam(req) ? { tools: buildToolsParam(req) } : {}),
    };

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 60_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: headers(credential.apiKey),
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`OpenAI API timeout: no response from ${url}`);
      }
      throw err;
    }
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    if (!res.body) {
      throw new Error(`OpenAI API returned no body`);
    }

    return res.body.pipeThrough(createUpstreamSSEParseTransform());
  },
};
