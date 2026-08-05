import { afterEach, describe, expect, test } from "bun:test";
import type { CanonicalRequest, CanonicalStreamChunk } from "../../types";
import { commandCodeAdapter } from "../adapter";

const realFetch = globalThis.fetch;

interface CommandCodeConfig {
  workingDir: string;
  date: string;
  environment: string;
}

interface CommandCodeParams {
  model: string;
  max_tokens?: number;
  stream: boolean;
  temperature?: number;
}

interface CommandCodeBody {
  threadId: string;
  memory: string;
  taste: string;
  skills: string;
  permissionMode: string;
  config: CommandCodeConfig;
  params: CommandCodeParams;
}

interface ForwardedMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image?: string } | { type: string; image_url: { url: string } }>;
}

interface ForwardedBody {
  params: {
    messages: ForwardedMessage[];
  };
}

interface CapturedCall {
  url: string;
  headers: Record<string, string>;
  body: CommandCodeBody;
}

let calls: CapturedCall[] = [];

/** Reads the single captured call, failing loudly if the adapter never fetched. */
function firstCall(): CapturedCall {
  const call = calls[0];
  if (!call) throw new Error("adapter did not issue a fetch");
  return call;
}

/**
 * Abridged from a real api.commandcode.ai/alpha/generate response.
 * Newline-delimited JSON with NO `data: ` prefix — the adapter previously
 * filtered on that prefix and silently discarded every event.
 */
const NDJSON_BODY = [
  '{"type":"start"}',
  '{"type":"start-step","request":{"body":{"maxOutputTokens":16}}}',
  '{"type":"reasoning-start","id":"reasoning-0"}',
  '{"type":"reasoning-delta","id":"reasoning-0","text":"The user wants me"}',
  '{"type":"reasoning-delta","id":"reasoning-0","text":" to say hello"}',
  '{"type":"reasoning-end","id":"reasoning-0"}',
  '{"type":"text-start","id":"txt-0"}',
  '{"type":"text-delta","id":"txt-0","text":"Hello"}',
  '{"type":"text-end","id":"txt-0"}',
  '{"type":"finish-step","finishReason":"length","usage":{"inputTokens":7416,"outputTokens":16,"totalTokens":7432}}',
  '{"type":"finish","finishReason":"length","totalUsage":{"inputTokens":7416,"outputTokens":16}}',
  "",
].join("\n");

function captureCall(url: string | URL | Request, init?: RequestInit) {
  calls.push({
    url: String(url),
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: JSON.parse(String(init?.body)) as CommandCodeBody,
  });
}

function stubFetch(status = 200, body = NDJSON_BODY) {
  calls = [];
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    captureCall(url, init);
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof fetch;
}

/** Serves the body as discrete network chunks, to exercise line buffering. */
function stubFetchChunks(chunks: string[]) {
  calls = [];
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    captureCall(url, init);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
}

async function drain(
  stream: ReadableStream<CanonicalStreamChunk>,
): Promise<CanonicalStreamChunk[]> {
  const out: CanonicalStreamChunk[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out.push(value);
  }
  return out;
}

const credential = { apiKey: "test-key" };

const probeRequest: CanonicalRequest = {
  messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
  maxTokens: 16,
  stream: true,
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("commandCodeAdapter request shape", () => {
  test("sends the CLI-shaped top-level fields upstream expects", async () => {
    stubFetch();
    await commandCodeAdapter.send(probeRequest, credential, "glm-5");

    const { body } = firstCall();
    expect(typeof body.threadId).toBe("string");
    expect(body.threadId.length).toBeGreaterThan(0);
    expect(body.memory).toBe("");
    // These three were missing before and made upstream reject the request.
    expect(body.taste).toBe("");
    expect(body.skills).toBe("");
    expect(body.permissionMode).toBe("standard");
  });

  test("config.environment is the fixed enum, not the host platform", async () => {
    stubFetch();
    await commandCodeAdapter.send(probeRequest, credential, "glm-5");

    expect(firstCall().body.config.environment).toBe("external");
    expect(firstCall().body.config.environment).not.toBe(process.platform);
  });

  test("forwards probe params without mangling them", async () => {
    stubFetch();
    await commandCodeAdapter.send(probeRequest, credential, "glm-5");

    const { params } = firstCall().body;
    expect(params.model).toBe("glm-5");
    expect(params.max_tokens).toBe(16);
    expect(params.stream).toBe(true);
    expect(params.temperature).toBe(0.3);
  });

  test("passes slashed model IDs through unchanged", async () => {
    stubFetch();
    await commandCodeAdapter.send(
      probeRequest,
      credential,
      "xiaomi/mimo-v2.5-pro",
    );

    expect(firstCall().body.params.model).toBe("xiaomi/mimo-v2.5-pro");
  });

  test("uses the CLI fingerprint headers on send", async () => {
    stubFetch();
    await commandCodeAdapter.send(probeRequest, credential, "glm-5");

    const { url, headers } = firstCall();
    expect(url).toBe("https://api.commandcode.ai/alpha/generate");
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["x-command-code-version"]).toBe("0.33.2");
    expect(headers["x-cli-environment"]).toBe("external");
    // Bun's default UA is an obvious proxy fingerprint.
    expect(headers["User-Agent"]).toBe("node");
  });

  test("uses the same headers on sendStream", async () => {
    stubFetch();
    await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5");

    const { headers } = firstCall();
    expect(headers["x-command-code-version"]).toBe("0.33.2");
    expect(headers["x-cli-environment"]).toBe("external");
    expect(headers["User-Agent"]).toBe("node");
  });

  test("throws on non-2xx so callers can surface the failure", async () => {
    stubFetch(400, '{"error":"bad request"}');

    await expect(
      commandCodeAdapter.send(probeRequest, credential, "glm-5"),
    ).rejects.toThrow(/Command Code API error 400/);
  });
});

describe("commandCodeAdapter send() response parsing", () => {
  test("extracts text from newline-delimited JSON without a data: prefix", async () => {
    stubFetch();
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "xiaomi/mimo-v2.5-pro",
    );

    // The regression: this returned [] because every line was filtered out
    // for not starting with "data: ".
    expect(res.message.content).toEqual([{ type: "text", text: "Hello" }]);
  });

  test("keeps reasoning tokens out of the assistant message", async () => {
    stubFetch();
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    const text = res.message.content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    expect(text).toBe("Hello");
    expect(text).not.toContain("The user wants me");
  });

  test("reads the nested usage shape", async () => {
    stubFetch();
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    expect(res.usage).toEqual({ inputTokens: 7416, outputTokens: 16 });
  });

  test("maps the upstream finishReason", async () => {
    stubFetch();
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    expect(res.finishReason).toBe("length");
  });

  test("maps the AI SDK 'tool-calls' finish reason", async () => {
    stubFetch(
      200,
      [
        '{"type":"text-delta","text":"x"}',
        '{"type":"finish","finishReason":"tool-calls"}',
      ].join("\n"),
    );
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    expect(res.finishReason).toBe("tool_call");
  });

  test("collects tool calls", async () => {
    stubFetch(
      200,
      [
        '{"type":"tool-call","toolCallId":"tc_1","toolName":"Read","input":{"path":"a.ts"}}',
        '{"type":"finish","finishReason":"tool-calls"}',
      ].join("\n"),
    );
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    expect(res.message.content).toEqual([
      {
        type: "tool_call",
        id: "tc_1",
        name: "Read",
        arguments: { path: "a.ts" },
      },
    ]);
  });

  test("still tolerates data:-prefixed SSE framing", async () => {
    stubFetch(
      200,
      [
        'data: {"type":"text-delta","text":"Hi"}',
        "",
        'data: {"type":"finish","finishReason":"stop"}',
        "",
        "data: [DONE]",
      ].join("\n"),
    );
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    expect(res.message.content).toEqual([{ type: "text", text: "Hi" }]);
    expect(res.finishReason).toBe("stop");
  });

  test("ignores blank lines and unparseable noise", async () => {
    stubFetch(
      200,
      [
        "",
        "not json at all",
        '{"type":"text-delta","text":"ok"}',
        "{broken json",
        '{"type":"finish","finishReason":"stop"}',
      ].join("\n"),
    );
    const res = await commandCodeAdapter.send(
      probeRequest,
      credential,
      "glm-5",
    );

    expect(res.message.content).toEqual([{ type: "text", text: "ok" }]);
  });
});

describe("commandCodeAdapter sendStream() parsing", () => {
  test("forwards text deltas but not reasoning deltas", async () => {
    stubFetch();
    const chunks = await drain(
      await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5"),
    );

    const text = chunks.map((c) => c.delta ?? "").join("");
    expect(text).toBe("Hello");
    expect(text).not.toContain("to say hello");
  });

  test("reassembles events split across chunk boundaries", async () => {
    // Split mid-JSON: previously the partial line was dropped outright.
    stubFetchChunks([
      '{"type":"text-delta","te',
      'xt":"Hel"}\n{"type":"text-delta","text":"lo"}\n',
      '{"type":"finish","finishReason":"stop"}\n',
    ]);

    const chunks = await drain(
      await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5"),
    );

    expect(chunks.map((c) => c.delta ?? "").join("")).toBe("Hello");
  });

  test("flushes a trailing line with no final newline", async () => {
    stubFetchChunks(['{"type":"text-delta","text":"tail"}']);

    const chunks = await drain(
      await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5"),
    );

    expect(chunks.map((c) => c.delta ?? "").join("")).toBe("tail");
  });

  test("emits usage and finish reason", async () => {
    stubFetch();
    const chunks = await drain(
      await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5"),
    );

    expect(chunks.some((c) => c.finishReason === "length")).toBe(true);
    expect(
      chunks.some(
        (c) => c.usage?.inputTokens === 7416 && c.usage?.outputTokens === 16,
      ),
    ).toBe(true);
  });

  test("emits tool call chunks from tool-input events", async () => {
    stubFetch(
      200,
      [
        '{"type":"tool-input-start","id":"tc_1","toolName":"Read"}',
        '{"type":"tool-input-delta","id":"tc_1","delta":"{\\"path\\":\\"/f"}',
        '{"type":"tool-input-delta","id":"tc_1","delta":"oo.txt\\"}"}',
        '{"type":"tool-call","toolCallId":"tc_1","toolName":"Read","input":{"path":"/foo.txt"}}',
        '{"type":"finish","finishReason":"tool-calls"}',
      ].join("\n"),
    );

    const chunks = await drain(
      await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5"),
    );

    expect(chunks.some((c) => c.toolCallStart?.toolName === "Read")).toBe(true);
    expect(
      chunks.some(
        (c) =>
          c.toolCallDelta?.toolCallId === "tc_1" &&
          c.toolCallDelta?.arguments?.includes("path"),
      ),
    ).toBe(true);
    expect(chunks.some((c) => c.finishReason === "tool_call")).toBe(true);
  });

  test("emits full tool call when no tool-input deltas precede it", async () => {
    stubFetch(
      200,
      [
        '{"type":"tool-call","toolCallId":"tc_1","toolName":"Read","input":{"path":"a.ts"}}',
        '{"type":"finish","finishReason":"tool-calls"}',
      ].join("\n"),
    );

    const chunks = await drain(
      await commandCodeAdapter.sendStream(probeRequest, credential, "glm-5"),
    );

    expect(chunks.some((c) => c.toolCallStart?.toolName === "Read")).toBe(true);
    expect(
      chunks.some((c) => c.toolCallDelta?.arguments === '{"path":"a.ts"}'),
    ).toBe(true);
    expect(chunks.some((c) => c.finishReason === "tool_call")).toBe(true);
  });
});

describe("image handling", () => {
  test("sends image parts for vision model mimo-v2.5", async () => {
    let capturedBody: unknown = null;
    globalThis.fetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode('{"type":"text-delta","text":"ok"}\n'),
          );
          c.enqueue(
            new TextEncoder().encode(
              '{"type":"finish","finishReason":"stop","totalUsage":{"inputTokens":1,"outputTokens":1}}\n',
            ),
          );
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    };

    await commandCodeAdapter.send(
      {
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "describe this image" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,abc123" },
              },
            ],
          },
        ],
      },
      { apiKey: "k" },
      "xiaomi/mimo-v2.5",
    );

    const body = capturedBody as ForwardedBody;
    const userMsg = body.params.messages.find((m: ForwardedMessage) => m.role === "user");
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toEqual([
      { type: "text", text: "describe this image" },
      { type: "image", image: "data:image/png;base64,abc123" },
    ]);
  });

  test("sends plain string for non-vision model", async () => {
    let capturedBody: unknown = null;
    globalThis.fetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode('{"type":"text-delta","text":"ok"}\n'),
          );
          c.enqueue(
            new TextEncoder().encode(
              '{"type":"finish","finishReason":"stop","totalUsage":{"inputTokens":1,"outputTokens":1}}\n',
            ),
          );
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    };

    await commandCodeAdapter.send(
      {
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "hello" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,abc" },
              },
            ],
          },
        ],
      },
      { apiKey: "k" },
      "deepseek/deepseek-v4-pro",
    );

    const body = capturedBody as ForwardedBody;
    const userMsg = body.params.messages.find((m: ForwardedMessage) => m.role === "user");
    expect(typeof userMsg.content).toBe("string");
    expect(userMsg.content).toBe("hello");
  });

  test("excludes mimo-v2.5-pro from vision", async () => {
    let capturedBody: unknown = null;
    globalThis.fetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode('{"type":"text-delta","text":"ok"}\n'),
          );
          c.enqueue(
            new TextEncoder().encode(
              '{"type":"finish","finishReason":"stop","totalUsage":{"inputTokens":1,"outputTokens":1}}\n',
            ),
          );
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    };

    await commandCodeAdapter.send(
      {
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "hello" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,abc" },
              },
            ],
          },
        ],
      },
      { apiKey: "k" },
      "xiaomi/mimo-v2.5-pro",
    );

    const body = capturedBody as ForwardedBody;
    const userMsg = body.params.messages.find((m: ForwardedMessage) => m.role === "user");
    expect(typeof userMsg.content).toBe("string");
    expect(userMsg.content).toBe("hello");
  });
});
