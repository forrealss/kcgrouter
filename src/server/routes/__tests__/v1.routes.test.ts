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

interface ErrorBody {
  error: { message: string };
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
  async send() {
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

describe("POST /v1/messages (streaming not yet supported)", () => {
  test("fails loudly instead of hanging the client", async () => {
    const handler = v1Routes["POST /v1/messages"];
    if (!handler) throw new Error("route not registered");

    const res = await handler(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelRef,
          stream: true,
          max_tokens: 16,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );

    expect(res.status).toBe(501);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toContain("not yet supported");
  });

  test("non-streaming anthropic still works", async () => {
    const handler = v1Routes["POST /v1/messages"];
    if (!handler) throw new Error("route not registered");

    const res = await handler(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelRef,
          stream: false,
          max_tokens: 16,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as AnthropicMessageBody;
    expect(body.type).toBe("message");
    expect(body.content[0]?.text).toBe("Hello world");
  });
});
