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

    const contentType = res.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/event-stream") &&
      !contentType.includes("application/json") &&
      !contentType.includes("text/plain")
    ) {
      const text = await res.text();
      throw new Error(
        `Unexpected response content-type "${contentType}": ${text.slice(0, 200)}`,
      );
    }

    const upstreamReader = res.body?.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";
    let eof = false;

    function parseLine(line: string): {
      done: boolean;
      chunks: CanonicalStreamChunk[];
    } {
      if (!line.startsWith("data:")) return { done: false, chunks: [] };
      const data = line.slice(5).trim();
      if (data === "[DONE]") return { done: true, chunks: [] };

      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const delta = parsed.choices?.[0]?.delta as
          | Record<string, unknown>
          | undefined;
        const finish = parsed.choices?.[0]?.finish_reason as string | undefined;

        const chunks: CanonicalStreamChunk[] = [];

        if (delta?.content) {
          let content = delta.content as string;
          if (content.includes("<think>")) {
            content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          }
          if (content.length > 0) {
            chunks.push({ delta: content });
          }
        }

        if (finish) {
          chunks.push({
            delta: "",
            finishReason: FINISH_MAP[finish] ?? "stop",
          });
        }

        if (parsed.usage) {
          const u = parsed.usage as {
            prompt_tokens: number;
            completion_tokens: number;
          };
          chunks.push({
            delta: "",
            usage: {
              inputTokens: u.prompt_tokens,
              outputTokens: u.completion_tokens,
            },
          });
        }

        return { done: false, chunks };
      } catch {
        return { done: false, chunks: [] };
      }
    }

    return new ReadableStream<CanonicalStreamChunk>({
      async pull(controller) {
        if (!upstreamReader || eof) {
          controller.close();
          return;
        }

        while (true) {
          const nlIndex = lineBuffer.indexOf("\n");
          if (nlIndex === -1) break;

          const line = lineBuffer.slice(0, nlIndex).trim();
          lineBuffer = lineBuffer.slice(nlIndex + 1);

          if (!line) continue;
          const result = parseLine(line);
          if (result.done) {
            eof = true;
            controller.close();
            return;
          }
          for (const chunk of result.chunks) controller.enqueue(chunk);
        }

        const { done, value } = await upstreamReader.read();
        if (done) {
          const remaining = lineBuffer.trim();
          if (remaining) {
            const result = parseLine(remaining);
            for (const chunk of result.chunks) controller.enqueue(chunk);
          }
          eof = true;
          controller.close();
          return;
        }

        lineBuffer += decoder.decode(value, { stream: true });
      },

      cancel() {
        eof = true;
        upstreamReader?.cancel().catch(() => {});
      },
    });
  },
};
