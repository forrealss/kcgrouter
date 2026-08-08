import { describe, expect, test } from "bun:test";

import type { CanonicalStreamChunk } from "../../types";
import { assembleResponse, createQoderStream } from "../adapter";

/** Build a byte ReadableStream carrying the given SSE lines. */
function makeBody(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

/** Drain a canonical chunk stream into an array. */
async function drain(
  stream: ReadableStream<CanonicalStreamChunk>,
): Promise<CanonicalStreamChunk[]> {
  const reader = stream.getReader();
  const chunks: CanonicalStreamChunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

function envelope(inner: string, status = 200): string {
  return `data: ${JSON.stringify({ statusCodeValue: status, body: inner })}\n\n`;
}

describe("createQoderStream", () => {
  test("unwraps an OpenAI envelope chunk into a delta", async () => {
    const inner = JSON.stringify({ choices: [{ delta: { content: "hi" } }] });
    const chunks = await drain(createQoderStream(makeBody([envelope(inner)])));
    expect(chunks.some((c) => c.delta === "hi")).toBe(true);
  });

  test("drains a trailing partial line without a newline", async () => {
    const inner = JSON.stringify({
      choices: [{ delta: { content: "tail" }, finish_reason: "stop" }],
    });
    // No trailing newline on the final line.
    const upstream = `data: ${JSON.stringify({ statusCodeValue: 200, body: inner })}`;
    const chunks = await drain(createQoderStream(makeBody([upstream])));
    expect(chunks.some((c) => c.delta === "tail")).toBe(true);
    expect(chunks.some((c) => c.finishReason === "stop")).toBe(true);
  });

  test("an error envelope produces an error chunk and nothing after it", async () => {
    const errorEnv = envelope(JSON.stringify("boom"), 500);
    const validInner = JSON.stringify({
      choices: [{ delta: { content: "leak" } }],
    });
    const chunks = await drain(
      createQoderStream(makeBody([errorEnv, envelope(validInner)])),
    );
    expect(chunks.filter((c) => c.delta === "leak")).toHaveLength(0);
    const errorChunks = chunks.filter((c) => c.finishReason === "error");
    expect(errorChunks.length).toBe(1);
    expect((errorChunks[0]?.delta ?? "").includes("qoder error 500")).toBe(
      true,
    );
  });

  test("maps finish_reason to canonical finish reasons", async () => {
    const inner = JSON.stringify({
      choices: [{ delta: { content: "ok" }, finish_reason: "length" }],
    });
    const chunks = await drain(createQoderStream(makeBody([envelope(inner)])));
    expect(chunks.some((c) => c.finishReason === "length")).toBe(true);
  });

  test("correlates streaming tool call fragments", async () => {
    const start = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "f", arguments: "" },
              },
            ],
          },
        },
      ],
    });
    const frag = JSON.stringify({
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] },
        },
      ],
    });
    const chunks = await drain(
      createQoderStream(makeBody([envelope(start), envelope(frag)])),
    );
    expect(chunks.some((c) => c.toolCallStart?.toolCallId === "call_1")).toBe(
      true,
    );
    expect(
      chunks.some(
        (c) =>
          c.toolCallDelta?.toolCallId === "call_1" &&
          c.toolCallDelta.arguments === "{}",
      ),
    ).toBe(true);
  });

  test("maps usage from an inner chunk", async () => {
    const inner = JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const chunks = await drain(createQoderStream(makeBody([envelope(inner)])));
    expect(
      chunks.some(
        (c) => c.usage?.inputTokens === 10 && c.usage.outputTokens === 5,
      ),
    ).toBe(true);
  });

  test("handles an inner body containing embedded newlines", async () => {
    const inner = '{"choices":[{"delta":{"content":"a\\nb"}}]}';
    const chunks = await drain(createQoderStream(makeBody([envelope(inner)])));
    expect(chunks.some((c) => c.delta === "a\nb")).toBe(true);
  });
});

describe("assembleResponse", () => {
  test("joins deltas into text content", () => {
    const res = assembleResponse([
      { delta: "Hel" },
      { delta: "lo" },
      { delta: "", finishReason: "stop" },
    ]);
    expect(res.message.content).toEqual([{ type: "text", text: "Hello" }]);
    expect(res.finishReason).toBe("stop");
  });

  test("collects tool calls from start + delta fragments", () => {
    const res = assembleResponse([
      {
        toolCallStart: { toolCallId: "call_1", toolName: "get_weather" },
      },
      { toolCallDelta: { toolCallId: "call_1", arguments: '{"city":' } },
      { toolCallDelta: { toolCallId: "call_1", arguments: '"Jakarta"}' } },
    ]);
    expect(res.message.content).toHaveLength(1);
    const tc = res.message.content[0];
    expect(tc).toMatchObject({ type: "tool_call", name: "get_weather" });
    if (tc?.type === "tool_call") {
      expect(tc.arguments).toEqual({ city: "Jakarta" });
    }
  });
});
