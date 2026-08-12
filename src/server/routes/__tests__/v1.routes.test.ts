import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../../providers/types";

interface FrameChoice {
  delta?: { role?: string; content?: string };
  finish_reason?: string | null;
}

interface StreamFrame {
  choices: FrameChoice[];
}

interface OpenAICompletionBody {
  object?: string;
  choices: Array<{ message: { content: string | null } }>;
  usage: { total_tokens: number };
}

interface AnthropicMessageBody {
  type?: string;
  content: Array<{ type: string; text?: string }>;
}

// Stub the adapter registry before the route module pulls it in, so these
// tests exercise the HTTP + encoding layers without credentials or network.
const scripted: CanonicalStreamChunk[] = [
  { delta: "Hello" },
  { delta: " world" },
  {
    delta: "",
    finishReason: "stop",
    usage: { inputTokens: 11, outputTokens: 2 },
  },
];

const fakeAdapter: ProviderAdapter = {
  transport: "command-code",
  async send(_req, credential) {
    // Script upstream failures by API key so the router-level failover can be
    // exercised without any real network: keys containing "rate" look like a
    // 429 (rate limit), keys containing "bad" like a 502 (server error).
    if (credential.apiKey.includes("rate")) {
      throw new Error("OpenAI API error 429: rate limited");
    }
    if (credential.apiKey.includes("bad")) {
      throw new Error("OpenAI API error 502: boom");
    }
    return {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      },
      usage: { inputTokens: 11, outputTokens: 2 },
      finishReason: "stop",
    };
  },
  async sendStream() {
    return new ReadableStream<CanonicalStreamChunk>({
      start(controller) {
        for (const c of scripted) controller.enqueue(c);
        controller.close();
      },
    });
  },
};

mock.module("../../providers/registry", () => ({
  getAdapter: () => fakeAdapter,
  adapterRegistry: { "command-code": fakeAdapter },
}));

const { runMigrations } = await import("../../../db/migrations");
const { get, run } = await import("../../../db/client");
const ProviderRegistry = await import(
  "../../services/provider-registry.service"
);
const { v1Routes } = await import("../v1.routes");

let modelRef = "";

beforeAll(() => {
  runMigrations();
  if (!get("SELECT * FROM app_settings WHERE id = 1")) {
    run(
      "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
      "",
      "light",
      0,
      new Date().toISOString(),
      new Date().toISOString(),
    );
  }

  const suffix = Math.random().toString(36).slice(2, 8);
  const provider = ProviderRegistry.createProvider({
    name: `SSETest-${suffix}`,
    transport: "command-code",
    baseUrl: "https://example.invalid",
    prefix: `ssetest${suffix}`,
  });
  ProviderRegistry.addAccount(provider.id, {
    label: "acct",
    apiKey: "sk_fake_for_test",
  });

  modelRef = `${provider.prefix}/some-model`;
});

function postCompletions(body: unknown): Promise<Response> {
  const handler = v1Routes["POST /v1/chat/completions"];
  if (!handler) throw new Error("route not registered");
  return Promise.resolve(
    handler(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

describe("POST /v1/chat/completions (streaming)", () => {
  test("returns SSE bytes rather than a stringified stream", async () => {
    const res = await postCompletions({
      model: modelRef,
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const raw = await res.text();
    // The regression: the handler used to JSON.stringify the ReadableStream,
    // so clients received exactly "{}" and hung.
    expect(raw).not.toBe("{}");
    expect(raw).toContain("data: ");
  });

  test("streams the assembled assistant text", async () => {
    const res = await postCompletions({
      model: modelRef,
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });

    const frames = (await res.text())
      .split("\n\n")
      .map((b) => b.trim())
      .filter((b) => b.startsWith("data: "))
      .map((b) => b.slice(6))
      .filter((p) => p !== "[DONE]")
      .map((p) => JSON.parse(p) as StreamFrame);

    expect(frames[0]?.choices[0]?.delta).toEqual({ role: "assistant" });
    expect(frames.map((f) => f.choices[0]?.delta?.content ?? "").join("")).toBe(
      "Hello world",
    );
    expect(
      frames.find((f) => f.choices[0]?.finish_reason)?.choices[0]
        ?.finish_reason,
    ).toBe("stop");
  });

  test("terminates with [DONE] so clients close instead of timing out", async () => {
    const res = await postCompletions({
      model: modelRef,
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });

    expect((await res.text()).endsWith("data: [DONE]\n\n")).toBe(true);
  });

  test("includes a usage chunk when the client asks for it", async () => {
    const res = await postCompletions({
      model: modelRef,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: "hi" }],
    });

    const raw = await res.text();
    expect(raw).toContain('"prompt_tokens":11');
    expect(raw).toContain('"completion_tokens":2');
  });
});

describe("POST /v1/chat/completions (non-streaming)", () => {
  test("still returns a JSON completion", async () => {
    const res = await postCompletions({
      model: modelRef,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = (await res.json()) as OpenAICompletionBody;
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0]?.message.content).toBe("Hello world");
    expect(body.usage.total_tokens).toBe(13);
  });
});

interface AnthropicStreamEvent {
  type: string;
  message?: { role?: string; id?: string };
  index?: number;
  content_block?: { type: string; text?: string };
  delta?: { type?: string; text?: string; stop_reason?: string };
  usage?: { input_tokens: number; output_tokens: number };
}

/** Parses `event:` + `data:` SSE frames into {event, payload} objects. */
function parseAnthropicEvents(raw: string): Array<{
  event: string;
  data: AnthropicStreamEvent;
}> {
  return raw
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => {
      const eventLine = b.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = b.split("\n").find((l) => l.startsWith("data: "));
      return {
        event: eventLine?.slice(7) ?? "",
        data: JSON.parse(
          (dataLine ?? "data: {}").slice(6),
        ) as AnthropicStreamEvent,
      };
    });
}

describe("POST /v1/chat/completions (prefix route failover)", () => {
  function makeProvider(label: string) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const provider = ProviderRegistry.createProvider({
      name: `Failover-${label}-${suffix}`,
      transport: "command-code",
      baseUrl: "https://example.invalid",
      prefix: `failover${label}${suffix}`,
    });
    return provider;
  }

  test("falls over to the next account when the first one fails", async () => {
    const provider = makeProvider("A");
    // listAccounts returns newest first, so create the good account before the
    // bad one — the bad account is then the first one the router tries.
    ProviderRegistry.addAccount(provider.id, {
      label: "good",
      apiKey: "sk_good_key",
    });
    const bad = ProviderRegistry.addAccount(provider.id, {
      label: "bad",
      apiKey: "sk_bad_key",
    });

    const res = await postCompletions({
      model: `${provider.prefix}/some-model`,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });

    // The bad account errored and the good one served the request.
    expect(res.status).toBe(200);
    const body = (await res.json()) as OpenAICompletionBody;
    expect(body.choices[0]?.message.content).toBe("Hello world");

    const badAfter = ProviderRegistry.getAccount(bad.id);
    expect(badAfter?.status).toBe("error");
    expect(badAfter?.cooldownUntil).not.toBeNull();

    ProviderRegistry.deleteProvider(provider.id);
  });

  test("returns 502 when every account fails", async () => {
    const provider = makeProvider("B");
    ProviderRegistry.addAccount(provider.id, {
      label: "bad1",
      apiKey: "sk_bad_key",
    });
    ProviderRegistry.addAccount(provider.id, {
      label: "bad2",
      apiKey: "sk_bad_key",
    });

    const res = await postCompletions({
      model: `${provider.prefix}/some-model`,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.status).toBe(502);
    ProviderRegistry.deleteProvider(provider.id);
  });

  test("returns 503 while the only account is cooling down after a 429", async () => {
    const provider = makeProvider("C");
    ProviderRegistry.addAccount(provider.id, {
      label: "ratelimited",
      apiKey: "sk_rate_key",
    });

    // First request: account fails with 429 → marked error + cooldown.
    const first = await postCompletions({
      model: `${provider.prefix}/some-model`,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(first.status).toBe(502);

    // Second request: the account is inside its cooldown window → 503.
    const second = await postCompletions({
      model: `${provider.prefix}/some-model`,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(second.status).toBe(503);

    ProviderRegistry.deleteProvider(provider.id);
  });
});

describe("POST /v1/messages/count_tokens", () => {
  function postCountTokens(body: unknown): Promise<Response> {
    const handler = v1Routes["POST /v1/messages/count_tokens"];
    if (!handler) throw new Error("route not registered");
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(
      handler(
        new Request("http://localhost/v1/messages/count_tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        }),
      ),
    );
  }

  test("returns a local input_tokens estimate", async () => {
    const res = await postCountTokens({
      model: modelRef,
      system: "hello world",
      messages: [{ role: "user", content: "hi there" }],
    });

    expect(res.status).toBe(200);
    // Response.json() appends the charset parameter in Bun.
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as { input_tokens: number };
    expect(body.input_tokens).toBe(5);
  });

  test("counts structured blocks like tool_use, tool_result and thinking", async () => {
    const res = await postCountTokens({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "ok" },
            { type: "tool_use", name: "get_weather", input: { city: "NYC" } },
          ],
        },
        {
          role: "user",
          content: [{ type: "tool_result", content: "it is sunny" }],
        },
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: "let me think" }],
        },
      ],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { input_tokens: number };
    // 20 + 12 + 12 chars → ceil(44 / 4) = 11
    expect(body.input_tokens).toBe(11);
  });

  test("rejects invalid JSON with 400", async () => {
    const res = await postCountTokens("not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  test("rejects valid JSON primitives like null with 400", async () => {
    const res = await postCountTokens(null);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });
});

describe("POST /v1/messages (streaming)", () => {
  function postMessages(body: unknown): Promise<Response> {
    const handler = v1Routes["POST /v1/messages"];
    if (!handler) throw new Error("route not registered");
    return Promise.resolve(
      handler(
        new Request("http://localhost/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    );
  }

  test("returns Anthropic SSE bytes rather than a stringified stream", async () => {
    const res = await postMessages({
      model: modelRef,
      stream: true,
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const raw = await res.text();
    expect(raw).not.toBe("{}");
    expect(raw).toContain("event: message_start");
  });

  test("streams message_start → text deltas → message_delta → message_stop", async () => {
    const res = await postMessages({
      model: modelRef,
      stream: true,
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    });

    const events = parseAnthropicEvents(await res.text());

    // message_start announces the assistant message.
    expect(events[0]?.event).toBe("message_start");
    expect(events[0]?.data.message?.role).toBe("assistant");

    // Text deltas assemble the full answer.
    const text = events
      .filter((e) => e.data.delta?.type === "text_delta")
      .map((e) => e.data.delta?.text ?? "")
      .join("");
    expect(text).toBe("Hello world");

    // Stream terminates with stop_reason + usage, then message_stop.
    const deltaEvent = events.find((e) => e.event === "message_delta");
    expect(deltaEvent?.data.delta?.stop_reason).toBe("end_turn");
    expect(deltaEvent?.data.usage?.input_tokens).toBe(11);
    expect(deltaEvent?.data.usage?.output_tokens).toBe(2);
    expect(events[events.length - 1]?.event).toBe("message_stop");
  });

  test("non-streaming anthropic still works", async () => {
    const res = await postMessages({
      model: modelRef,
      stream: false,
      max_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as AnthropicMessageBody;
    expect(body.type).toBe("message");
    expect(body.content[0]?.text).toBe("Hello world");
  });
});
