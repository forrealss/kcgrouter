import { describe, expect, test } from "bun:test";
import type { CanonicalStreamChunk } from "../../providers/types";
import {
  ANTHROPIC_SSE_HEADERS,
  encodeAnthropicStream,
} from "../anthropic-sse-encoder.service";

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

interface AnthropicFrame {
  type: string;
  index?: number;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: unknown[];
    stop_reason?: string | null;
    usage?: { input_tokens: number; output_tokens: number };
  };
  content_block?: {
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

/** Parses `event: <name>` / `data: <json>` frames into typed events. */
function parseEvents(
  raw: string,
): Array<{ event: string; data: AnthropicFrame }> {
  return raw
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => {
      const eventLine = b.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = b.split("\n").find((l) => l.startsWith("data: "));
      return {
        event: eventLine?.slice(7) ?? "",
        data: JSON.parse((dataLine ?? "data: {}").slice(6)) as AnthropicFrame,
      };
    });
}

const opts = { model: "cc/claude-sonnet-5" };

describe("ANTHROPIC_SSE_HEADERS", () => {
  test("declares the SSE content type and disables proxy buffering", () => {
    expect(ANTHROPIC_SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
    expect(ANTHROPIC_SSE_HEADERS["Cache-Control"]).toBe("no-cache");
    expect(ANTHROPIC_SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});

describe("encodeAnthropicStream framing", () => {
  test("emits real bytes, not a stringified object", async () => {
    const raw = await collect(
      encodeAnthropicStream(sourceOf([{ delta: "Hi" }]), opts),
    );

    expect(raw).not.toBe("{}");
    expect(raw.length).toBeGreaterThan(10);
  });

  test("frames every event as `event: <type>` + `data: <json>`", async () => {
    const raw = await collect(
      encodeAnthropicStream(sourceOf([{ delta: "Hi" }]), opts),
    );

    const events = parseEvents(raw);
    expect(events.length).toBeGreaterThan(0);
    for (const { event, data } of events) {
      expect(event).toBe(data.type);
    }
    expect(raw.endsWith("\n\n")).toBe(true);
  });

  test("starts with message_start and ends with message_stop", async () => {
    const events = parseEvents(
      await collect(encodeAnthropicStream(sourceOf([{ delta: "Hi" }]), opts)),
    );

    expect(events[0]?.event).toBe("message_start");
    expect(events[events.length - 1]?.event).toBe("message_stop");
  });

  test("message_start carries a spec-conformant assistant message", async () => {
    const events = parseEvents(
      await collect(encodeAnthropicStream(sourceOf([{ delta: "Hi" }]), opts)),
    );

    const message = events[0]?.data.message;
    expect(message?.role).toBe("assistant");
    expect(message?.content).toEqual([]);
    expect(message?.stop_reason).toBeNull();
    expect(typeof message?.id).toBe("string");
    expect(message?.id?.startsWith("msg_")).toBe(true);
    expect(message?.model).toBe("cc/claude-sonnet-5");
  });

  test("does not emit a bare `data:` frame without an event name", async () => {
    const raw = await collect(
      encodeAnthropicStream(sourceOf([{ delta: "Hi" }]), opts),
    );

    for (const block of raw.split("\n\n").filter((b) => b.trim())) {
      expect(block.startsWith("event: ")).toBe(true);
    }
  });
});

describe("encodeAnthropicStream content", () => {
  test("streams text as content_block_start/delta/stop", async () => {
    const events = parseEvents(
      await collect(
        encodeAnthropicStream(
          sourceOf([{ delta: "Hello" }, { delta: ", " }, { delta: "world" }]),
          opts,
        ),
      ),
    );

    const text = events
      .filter((e) => e.data.delta?.type === "text_delta")
      .map((e) => e.data.delta?.text ?? "")
      .join("");
    expect(text).toBe("Hello, world");

    // Exactly one text block wraps the deltas.
    const starts = events.filter(
      (e) =>
        e.event === "content_block_start" &&
        e.data.content_block?.type === "text",
    );
    expect(starts).toHaveLength(1);
    const stops = events.filter((e) => e.event === "content_block_stop");
    expect(stops).toHaveLength(1);
  });

  test("maps canonical finish reasons to Anthropic stop reasons", async () => {
    const cases: Array<[CanonicalStreamChunk["finishReason"], string]> = [
      ["stop", "end_turn"],
      ["length", "max_tokens"],
      ["tool_call", "tool_use"],
      ["error", "end_turn"],
    ];

    for (const [canonical, expected] of cases) {
      const events = parseEvents(
        await collect(
          encodeAnthropicStream(
            sourceOf([{ delta: "x", finishReason: canonical }]),
            opts,
          ),
        ),
      );
      const deltaEvent = events.find((e) => e.event === "message_delta");
      expect(deltaEvent?.data.delta?.stop_reason).toBe(expected);
    }
  });

  test("synthesizes message_delta when the source ends without a finish", async () => {
    const events = parseEvents(
      await collect(encodeAnthropicStream(sourceOf([{ delta: "Hi" }]), opts)),
    );

    expect(events.filter((e) => e.event === "message_delta")).toHaveLength(1);
    expect(events[events.length - 1]?.event).toBe("message_stop");
  });

  test("still produces a valid sequence when the source is empty", async () => {
    const events = parseEvents(
      await collect(encodeAnthropicStream(sourceOf([]), opts)),
    );

    expect(events[0]?.event).toBe("message_start");
    expect(events[events.length - 1]?.event).toBe("message_stop");
    expect(events.some((e) => e.event === "message_delta")).toBe(true);
  });
});

describe("encodeAnthropicStream reasoning", () => {
  test("wraps reasoning chunks in a thinking block", async () => {
    const events = parseEvents(
      await collect(
        encodeAnthropicStream(
          sourceOf([
            { reasoning: "Let me think" },
            { reasoning: " more" },
            { delta: "Answer" },
          ]),
          opts,
        ),
      ),
    );
    const startIndex = events.findIndex(
      (e) =>
        e.event === "content_block_start" &&
        e.data.content_block?.type === "thinking",
    );
    expect(startIndex).toBeGreaterThan(-1);
    expect(events[startIndex]?.data.content_block?.type).toBe("thinking");

    const thinkingText = events
      .filter((e) => e.data.delta?.type === "thinking_delta")
      .map((e) => e.data.delta?.thinking ?? "")
      .join("");
    expect(thinkingText).toBe("Let me think more");

    // The thinking block is stopped before the text block opens.
    const textStart = events.findIndex(
      (e) =>
        e.event === "content_block_start" &&
        e.data.content_block?.type === "text",
    );
    expect(textStart).toBeGreaterThan(startIndex);
    expect(
      events
        .slice(startIndex, textStart)
        .some((e) => e.event === "content_block_stop"),
    ).toBe(true);
  });
});

describe("encodeAnthropicStream tool calls", () => {
  test("streams tool_use start, input_json deltas, and stop", async () => {
    const events = parseEvents(
      await collect(
        encodeAnthropicStream(
          sourceOf([
            {
              toolCallStart: { toolCallId: "toolu_01", toolName: "Read" },
            },
            {
              toolCallDelta: {
                toolCallId: "toolu_01",
                arguments: '{"file_path":',
              },
            },
            {
              toolCallDelta: { toolCallId: "toolu_01", arguments: '"x.txt"}' },
            },
            { delta: "", finishReason: "tool_call" },
          ]),
          opts,
        ),
      ),
    );

    const start = events.find((e) => e.event === "content_block_start");
    expect(start?.data.content_block?.type).toBe("tool_use");
    expect(start?.data.content_block?.id).toBe("toolu_01");
    expect(start?.data.content_block?.name).toBe("Read");
    expect(start?.data.content_block?.input).toEqual({});

    const fragments = events
      .filter((e) => e.data.delta?.type === "input_json_delta")
      .map((e) => e.data.delta?.partial_json ?? "");
    expect(fragments.join("")).toBe('{"file_path":"x.txt"}');

    // Tool block closed, message terminates with tool_use stop reason.
    const stops = events.filter((e) => e.event === "content_block_stop");
    expect(stops.length).toBeGreaterThan(0);
    const deltaEvent = events.find((e) => e.event === "message_delta");
    expect(deltaEvent?.data.delta?.stop_reason).toBe("tool_use");
  });
});

describe("encodeAnthropicStream usage", () => {
  test("reports usage in message_delta", async () => {
    const events = parseEvents(
      await collect(
        encodeAnthropicStream(
          sourceOf([
            { delta: "x", usage: { inputTokens: 10, outputTokens: 3 } },
            { delta: "", finishReason: "stop" },
          ]),
          opts,
        ),
      ),
    );

    const deltaEvent = events.find((e) => e.event === "message_delta");
    expect(deltaEvent?.data.usage).toEqual({
      input_tokens: 10,
      output_tokens: 3,
    });
  });

  test("reports usage to the completion hook", async () => {
    const seen: Array<{ inputTokens: number; outputTokens: number }> = [];

    await collect(
      encodeAnthropicStream(
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
      encodeAnthropicStream(
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

describe("encodeAnthropicStream failure handling", () => {
  test("reports a mid-stream error in-band and still terminates", async () => {
    const raw = await collect(
      encodeAnthropicStream(
        failingSourceAfter([{ delta: "partial" }], "upstream exploded"),
        opts,
      ),
    );

    const events = parseEvents(raw);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent?.data.error?.message).toContain("upstream exploded");
    // The status line is already committed, so the stream must still close
    // cleanly with message_stop rather than leaving the client hanging.
    expect(events[events.length - 1]?.event).toBe("message_stop");
  });

  test("records usage when the client cancels", async () => {
    const seen: Array<{ inputTokens: number; outputTokens: number }> = [];

    const stream = encodeAnthropicStream(
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
