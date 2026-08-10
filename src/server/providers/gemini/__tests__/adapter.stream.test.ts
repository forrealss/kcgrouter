import { describe, expect, test } from "bun:test";
import type { CanonicalRequest, CanonicalStreamChunk } from "../../types";
import { geminiAdapter } from "../adapter";

const req: CanonicalRequest = {
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  stream: true,
};

/** Mocks fetch so the adapter reads `lines` as the upstream SSE body. */
function mockSSE(lines: string[]) {
  const body = lines.join("\n");
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
}

/** Drains the canonical chunk stream, failing instead of hanging forever. */
async function drain(
  stream: ReadableStream<CanonicalStreamChunk>,
  timeoutMs = 3000,
): Promise<CanonicalStreamChunk[]> {
  const chunks: CanonicalStreamChunk[] = [];
  const reader = stream.getReader();

  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("STREAM_HANG: never closed")), timeoutMs),
  );

  await Promise.race([
    (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    })(),
    deadline,
  ]);

  return chunks;
}

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}`;
}

describe("gemini sendStream", () => {
  test("emits text deltas and finish reason", async () => {
    mockSSE([
      sseEvent({
        candidates: [
          { content: { parts: [{ text: "Hello" }] }, finishReason: "STOP" },
        ],
      }),
    ]);

    const chunks = await drain(
      await geminiAdapter.sendStream(req, { apiKey: "k" }, "gemini-2.5-pro"),
    );

    expect(chunks.map((c) => c.delta ?? "").join("")).toBe("Hello");
    expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("stop");
  });

  test("routes thought parts to the reasoning channel, not content", async () => {
    mockSSE([
      sseEvent({
        candidates: [
          {
            content: {
              parts: [{ text: "let me think", thought: true }],
            },
          },
        ],
      }),
    ]);

    const chunks = await drain(
      await geminiAdapter.sendStream(req, { apiKey: "k" }, "gemini-2.5-pro"),
    );

    expect(chunks.map((c) => c.reasoning ?? "").join("")).toBe("let me think");
    expect(chunks.map((c) => c.delta ?? "").join("")).toBe("");
  });

  test("emits toolCallStart + toolCallDelta for functionCall parts", async () => {
    mockSSE([
      sseEvent({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_weather",
                    args: { city: "NYC" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    ]);

    const chunks = await drain(
      await geminiAdapter.sendStream(req, { apiKey: "k" }, "gemini-2.5-pro"),
    );

    const start = chunks.find((c) => c.toolCallStart);
    expect(start?.toolCallStart?.toolName).toBe("get_weather");

    const delta = chunks.find((c) => c.toolCallDelta);
    expect(delta?.toolCallDelta?.toolCallId).toBe(
      start?.toolCallStart?.toolCallId,
    );
    expect(JSON.parse(delta?.toolCallDelta?.arguments ?? "{}")).toEqual({
      city: "NYC",
    });
  });

  test("processes multiple parts in a single chunk (parts[0]-only regression)", async () => {
    // A single SSE event with text AND a functionCall: the old handler read
    // only parts[0], silently dropping the tool call.
    mockSSE([
      sseEvent({
        candidates: [
          {
            content: {
              parts: [
                { text: "ok" },
                { functionCall: { name: "bash", args: { command: "ls" } } },
              ],
            },
          },
        ],
      }),
    ]);

    const chunks = await drain(
      await geminiAdapter.sendStream(req, { apiKey: "k" }, "gemini-2.5-pro"),
    );

    expect(chunks.map((c) => c.delta ?? "").join("")).toBe("ok");
    expect(chunks.some((c) => c.toolCallStart)).toBe(true);
    const delta = chunks.find((c) => c.toolCallDelta);
    expect(JSON.parse(delta?.toolCallDelta?.arguments ?? "{}")).toEqual({
      command: "ls",
    });
  });

  test("emits usage metadata", async () => {
    mockSSE([
      sseEvent({
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    ]);

    const chunks = await drain(
      await geminiAdapter.sendStream(req, { apiKey: "k" }, "gemini-2.5-pro"),
    );

    expect(chunks.find((c) => c.usage)?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
    });
  });
});

describe("gemini send (non-streaming)", () => {
  /** Mocks fetch so the adapter reads `payload` as the JSON response body. */
  function mockJson(payload: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
  }

  test("drops thought parts from the response content", async () => {
    mockJson({
      candidates: [
        {
          content: {
            parts: [
              { text: "let me think", thought: true },
              { text: "answer" },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
    });

    const res = await geminiAdapter.send(
      req,
      { apiKey: "k" },
      "gemini-2.5-pro",
    );

    expect(res.message.content).toEqual([{ type: "text", text: "answer" }]);
    expect(res.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
    expect(res.finishReason).toBe("stop");
  });
});
