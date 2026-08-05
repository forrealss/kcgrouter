import { describe, expect, test } from "bun:test";
import type { CanonicalStreamChunk } from "../../providers/types";
import { encodeOpenAIStream, OPENAI_SSE_HEADERS } from "../sse-encoder.service";

function sourceOf(
  chunks: CanonicalStreamChunk[],
): ReadableStream<CanonicalStreamChunk> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

/** Source that throws partway, to exercise mid-stream error handling. */
function failingSourceAfter(
  chunks: CanonicalStreamChunk[],
  message: string,
): ReadableStream<CanonicalStreamChunk> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        const chunk = chunks[i++];
        if (chunk) controller.enqueue(chunk);
        return;
      }
      throw new Error(message);
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out;
}

interface FrameChoice {
  index?: number;
  delta?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason?: string | null;
}

interface Frame {
  id: string;
  object?: string;
  created?: number;
  model?: string;
  choices: FrameChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: { message: string; type?: string; code?: string };
}

/** Parses the JSON payload of each `data:` frame, skipping the [DONE] sentinel. */
function parseFrames(raw: string): Frame[] {
  return raw
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b.startsWith("data: "))
    .map((b) => b.slice(6))
    .filter((p) => p !== "[DONE]")
    .map((p) => JSON.parse(p) as Frame);
}

const opts = { model: "xiaomi/mimo-v2.5-pro", includeUsage: false };

describe("OPENAI_SSE_HEADERS", () => {
  test("declares the SSE content type and disables proxy buffering", () => {
    expect(OPENAI_SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
    expect(OPENAI_SSE_HEADERS["Cache-Control"]).toBe("no-cache");
    // Without this, nginx buffers the whole stream and streaming is defeated.
    expect(OPENAI_SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});

describe("encodeOpenAIStream framing", () => {
  test("emits real bytes, not a stringified object", async () => {
    const raw = await collect(
      encodeOpenAIStream(sourceOf([{ delta: "Hi" }]), opts),
    );

    // The original bug: JSON.stringify(stream) produced exactly "{}".
    expect(raw).not.toBe("{}");
    expect(raw.length).toBeGreaterThan(10);
  });

  test("frames every event as `data: <json>` terminated by a blank line", async () => {
    const raw = await collect(
      encodeOpenAIStream(sourceOf([{ delta: "Hi" }]), opts),
    );

    for (const line of raw.split("\n\n").filter((b) => b.trim())) {
      expect(line.startsWith("data: ")).toBe(true);
    }
    expect(raw.endsWith("\n\n")).toBe(true);
  });

  test("terminates with the [DONE] sentinel", async () => {
    const raw = await collect(
      encodeOpenAIStream(sourceOf([{ delta: "Hi" }]), opts),
    );

    // Clients hang until timeout without this.
    expect(raw.endsWith("data: [DONE]\n\n")).toBe(true);
    expect(raw.match(/data: \[DONE\]/g)?.length).toBe(1);
  });

  test("announces the assistant role in the first chunk", async () => {
    const frames = parseFrames(
      await collect(encodeOpenAIStream(sourceOf([{ delta: "Hi" }]), opts)),
    );

    expect(frames[0]?.choices[0]?.delta).toEqual({ role: "assistant" });
  });

  test("carries the required OpenAI chunk fields", async () => {
    const frames = parseFrames(
      await collect(encodeOpenAIStream(sourceOf([{ delta: "Hi" }]), opts)),
    );

    const first = frames[0];
    expect(first?.object).toBe("chat.completion.chunk");
    expect(first?.model).toBe("xiaomi/mimo-v2.5-pro");
    expect(typeof first?.id).toBe("string");
    expect(first?.id.startsWith("chatcmpl-")).toBe(true);
    expect(typeof first?.created).toBe("number");
  });

  test("reuses one id and created stamp across all chunks", async () => {
    const frames = parseFrames(
      await collect(
        encodeOpenAIStream(
          sourceOf([
            { delta: "a" },
            { delta: "b" },
            { finishReason: "stop", delta: "" },
          ]),
          opts,
        ),
      ),
    );

    const ids = new Set(frames.map((f) => f.id));
    const stamps = new Set(frames.map((f) => f.created));
    expect(ids.size).toBe(1);
    expect(stamps.size).toBe(1);
  });
});

describe("encodeOpenAIStream content", () => {
  test("streams text deltas in order", async () => {
    const frames = parseFrames(
      await collect(
        encodeOpenAIStream(
          sourceOf([{ delta: "Hello" }, { delta: ", " }, { delta: "world" }]),
          opts,
        ),
      ),
    );

    const text = frames.map((f) => f.choices[0]?.delta?.content ?? "").join("");
    expect(text).toBe("Hello, world");
  });

  test("does not emit a content field for empty deltas", async () => {
    const frames = parseFrames(
      await collect(
        encodeOpenAIStream(sourceOf([{ delta: "" }, { delta: "x" }]), opts),
      ),
    );

    const contentFrames = frames.filter(
      (f) => f.choices[0]?.delta?.content !== undefined,
    );
    expect(contentFrames).toHaveLength(1);
    expect(contentFrames[0]?.choices[0]?.delta?.content).toBe("x");
  });

  test("maps finish reasons to OpenAI values", async () => {
    const cases: Array<[CanonicalStreamChunk["finishReason"], string]> = [
      ["stop", "stop"],
      ["length", "length"],
      ["tool_call", "tool_calls"],
      ["error", "stop"],
    ];

    for (const [canonical, expected] of cases) {
      const frames = parseFrames(
        await collect(
          encodeOpenAIStream(
            sourceOf([{ delta: "x", finishReason: canonical }]),
            opts,
          ),
        ),
      );
      const finish = frames.find((f) => f.choices[0]?.finish_reason !== null);
      expect(finish?.choices[0]?.finish_reason).toBe(expected);
    }
  });

  test("synthesizes a finish chunk when the source ends without one", async () => {
    const frames = parseFrames(
      await collect(encodeOpenAIStream(sourceOf([{ delta: "Hi" }]), opts)),
    );

    const finish = frames.filter((f) => f.choices[0]?.finish_reason !== null);
    expect(finish).toHaveLength(1);
    expect(finish[0]?.choices[0]?.finish_reason).toBe("stop");
  });

  test("emits exactly one finish chunk", async () => {
    const frames = parseFrames(
      await collect(
        encodeOpenAIStream(
          sourceOf([
            { delta: "x", finishReason: "stop" },
            { delta: "", finishReason: "stop" },
          ]),
          opts,
        ),
      ),
    );

    expect(
      frames.filter((f) => f.choices[0]?.finish_reason !== null),
    ).toHaveLength(1);
  });

  test("still produces a valid stream when the source is empty", async () => {
    const raw = await collect(encodeOpenAIStream(sourceOf([]), opts));
    const frames = parseFrames(raw);

    // Role + finish, so the client sees a well-formed empty turn.
    expect(frames[0]?.choices[0]?.delta).toEqual({ role: "assistant" });
    expect(frames[1]?.choices[0]?.finish_reason).toBe("stop");
    expect(raw.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});

describe("encodeOpenAIStream usage", () => {
  test("omits the usage chunk by default", async () => {
    const frames = parseFrames(
      await collect(
        encodeOpenAIStream(
          sourceOf([
            { delta: "x", usage: { inputTokens: 10, outputTokens: 3 } },
          ]),
          opts,
        ),
      ),
    );

    expect(frames.some((f) => f.usage !== undefined)).toBe(false);
  });

  test("appends a usage chunk when include_usage is set", async () => {
    const frames = parseFrames(
      await collect(
        encodeOpenAIStream(
          sourceOf([
            { delta: "x", usage: { inputTokens: 10, outputTokens: 3 } },
          ]),
          { ...opts, includeUsage: true },
        ),
      ),
    );

    const usageFrame = frames.find((f) => f.usage !== undefined);
    expect(usageFrame?.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 3,
      total_tokens: 13,
    });
    // OpenAI sends the usage chunk with an empty choices array.
    expect(usageFrame?.choices).toEqual([]);
  });

  test("reports usage to the completion hook", async () => {
    // Collected into an array so TS doesn't narrow the binding to null.
    const seen: Array<{ inputTokens: number; outputTokens: number }> = [];

    await collect(
      encodeOpenAIStream(
        sourceOf([{ delta: "x", usage: { inputTokens: 42, outputTokens: 7 } }]),
        opts,
        (usage) => {
          seen.push(usage);
        },
      ),
    );

    expect(seen).toEqual([{ inputTokens: 42, outputTokens: 7 }]);
  });

  test("fires the completion hook once", async () => {
    let calls = 0;
    await collect(
      encodeOpenAIStream(
        sourceOf([{ delta: "a" }, { delta: "b" }]),
        opts,
        () => {
          calls++;
        },
      ),
    );
    expect(calls).toBe(1);
  });
});

describe("encodeOpenAIStream failure handling", () => {
  test("reports a mid-stream error in-band and still terminates", async () => {
    const raw = await collect(
      encodeOpenAIStream(
        failingSourceAfter([{ delta: "partial" }], "upstream exploded"),
        opts,
      ),
    );

    const frames = parseFrames(raw);
    const errorFrame = frames.find((f) => f.error !== undefined);
    expect(errorFrame?.error?.message).toContain("upstream exploded");
    // The status line is already committed, so the stream must still close
    // cleanly rather than leaving the client hanging.
    expect(raw.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  test("records usage when the client cancels", async () => {
    // Collected into an array so TS doesn't narrow the binding to null.
    const seen: Array<{ inputTokens: number; outputTokens: number }> = [];

    const stream = encodeOpenAIStream(
      sourceOf([
        { delta: "a", usage: { inputTokens: 5, outputTokens: 1 } },
        { delta: "b" },
      ]),
      opts,
      (usage) => {
        seen.push(usage);
      },
    );

    const reader = stream.getReader();
    await reader.read();
    await reader.read();
    await reader.cancel("client disconnected");

    expect(seen).toEqual([{ inputTokens: 5, outputTokens: 1 }]);
  });
});
