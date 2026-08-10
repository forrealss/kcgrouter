import { describe, expect, test } from "bun:test";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalStreamChunk,
} from "../../types";
import { kiroAdapter } from "../adapter";

function textPart(parts: CanonicalContentPart[]): string | undefined {
  const part = parts.find(
    (p): p is Extract<CanonicalContentPart, { type: "text" }> =>
      p.type === "text",
  );
  return part?.text;
}

// --- AWS EventStream frame encoder (mirror of eventstream.ts parser) ---

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] as number;
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Encodes one string-typed (type 7) eventstream header. */
function encodeHeader(key: string, val: string): Uint8Array {
  const enc = new TextEncoder();
  const name = enc.encode(key);
  const value = enc.encode(val);

  // header: [nameLen:1][name][type:1=7][valueLen:2 BE][value]
  const out = new Uint8Array(1 + name.length + 1 + 2 + value.length);
  let o = 0;
  out[o++] = name.length;
  out.set(name, o);
  o += name.length;
  out[o++] = 7;
  out[o++] = (value.length >> 8) & 0xff;
  out[o++] = value.length & 0xff;
  out.set(value, o);
  return out;
}

/** Builds a valid AWS eventstream frame from arbitrary headers + JSON payload. */
function buildFrameWithHeaders(
  headerPairs: Record<string, string>,
  payload: unknown,
): Uint8Array {
  const enc = new TextEncoder();
  const headers = concat(
    Object.entries(headerPairs).map(([k, v]) => encodeHeader(k, v)),
  );

  const body = enc.encode(JSON.stringify(payload));
  const totalLength = 12 + headers.length + body.length + 4;

  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, totalLength, false);
  view.setUint32(4, headers.length, false);
  view.setUint32(8, crc32(frame.slice(0, 8)), false);
  frame.set(headers, 12);
  frame.set(body, 12 + headers.length);
  view.setUint32(
    totalLength - 4,
    crc32(frame.slice(0, totalLength - 4)),
    false,
  );

  return frame;
}

/** Builds a frame carrying only a :event-type header. */
function buildFrame(eventType: string, payload: unknown): Uint8Array {
  return buildFrameWithHeaders({ ":event-type": eventType }, payload);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Mocks fetch so the adapter reads `body` as the upstream eventstream. */
function mockFetch(body: Uint8Array, chunkSize = 1024) {
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < body.length; i += chunkSize) {
            controller.enqueue(body.subarray(i, i + chunkSize));
          }
          controller.close();
        },
      }),
      { status: 200 },
    )) as typeof fetch;
}

/**
 * Mocks fetch where the upstream sends all frames but never closes the
 * connection — AWS keeps the socket open after `messageStopEvent`, so the
 * adapter must terminate on that event rather than waiting for EOF.
 */
function mockFetchNoClose(body: Uint8Array) {
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(body);
          // Intentionally never call controller.close().
        },
      }),
      { status: 200 },
    )) as typeof fetch;
}

const req: CanonicalRequest = {
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  stream: true,
};

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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    })(),
    deadline,
  ]);

  return chunks;
}

test("stream terminates and emits finish for a text-only response", async () => {
  mockFetch(
    concat([
      buildFrame("assistantResponseEvent", { content: "Hello" }),
      buildFrame("assistantResponseEvent", { content: " world" }),
      buildFrame("metricsEvent", { inputTokens: 10, outputTokens: 5 }),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const text = chunks.map((c) => c.delta ?? "").join("");
  expect(text).toBe("Hello world");

  const finish = chunks.find((c) => c.finishReason);
  expect(finish?.finishReason).toBe("stop");
  expect(finish?.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
});

test("stream terminates when the body ends on a partial frame", async () => {
  const full = concat([
    buildFrame("assistantResponseEvent", { content: "hi" }),
    buildFrame("metricsEvent", { inputTokens: 1, outputTokens: 1 }),
  ]);
  // Truncate mid-frame: the queue keeps leftover bytes that never complete.
  mockFetch(full.subarray(0, full.length - 6));

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  expect(chunks.some((c) => c.finishReason)).toBe(true);
});

test("tool call arguments accumulate into valid JSON (string fragments)", async () => {
  // Kiro streams tool input as incremental partial-JSON fragments.
  mockFetch(
    concat([
      buildFrame("toolUseEvent", {
        toolUseId: "t1",
        name: "bash",
        input: '{"comm',
      }),
      buildFrame("toolUseEvent", {
        toolUseId: "t1",
        name: "bash",
        input: 'and":"ls"}',
        stop: true,
      }),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const starts = chunks.filter((c) => c.toolCallStart);
  expect(starts.length).toBe(1);
  expect(starts[0]?.toolCallStart?.toolName).toBe("bash");

  const args = chunks
    .filter((c) => c.toolCallDelta)
    .map((c) => c.toolCallDelta?.arguments ?? "")
    .join("");
  expect(JSON.parse(args)).toEqual({ command: "ls" });

  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("tool_call");
});

test("stream terminates on messageStopEvent without waiting for EOF", async () => {
  // AWS keeps the connection open after the stop event; relying on EOF hangs.
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "done" }),
      buildFrame("metricsEvent", { inputTokens: 3, outputTokens: 2 }),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  expect(chunks.map((c) => c.delta ?? "").join("")).toBe("done");
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("stop");
});

test("object-form tool input yields parseable JSON, not concatenated prefixes", async () => {
  // Object payloads are *partial objects that grow*, not fragments. Emitting
  // each one verbatim concatenates overlapping JSON into unparseable garbage.
  mockFetchNoClose(
    concat([
      buildFrame("toolUseEvent", {
        toolUseId: "t2",
        name: "bash",
        input: { command: "l" },
      }),
      buildFrame("toolUseEvent", {
        toolUseId: "t2",
        name: "bash",
        input: { command: "ls -la" },
      }),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const args = chunks
    .filter((c) => c.toolCallDelta)
    .map((c) => c.toolCallDelta?.arguments ?? "")
    .join("");

  // Must be the final canonical object, emitted exactly once.
  expect(JSON.parse(args)).toEqual({ command: "ls -la" });
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("tool_call");
});

test("array-form toolUseEvent payload emits every tool call", async () => {
  // A single frame can carry an array of tool uses.
  mockFetchNoClose(
    concat([
      buildFrame("toolUseEvent", [
        { toolUseId: "a", name: "bash", input: { command: "ls" } },
        { toolUseId: "b", name: "read", input: { path: "x.ts" } },
      ]),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const names = chunks
    .filter((c) => c.toolCallStart)
    .map((c) => c.toolCallStart?.toolName);
  expect(names).toEqual(["bash", "read"]);
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("tool_call");
});

test("stream terminates on a payload-shaped stop signal", async () => {
  // Some responses signal completion via payload.messageStopEvent.
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "ok" }),
      buildFrame("someOtherEvent", { messageStopEvent: {} }),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("stop");
});

test("stream terminates on a 'done' event type", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "ok" }),
      buildFrame("done", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("stop");
});

test("upstream exception frame surfaces as an error instead of hanging", async () => {
  // AWS sends exception frames via :message-type / :exception-type headers and
  // does not follow them with a stop event.
  mockFetchNoClose(
    concat([
      buildFrameWithHeaders(
        {
          ":message-type": "exception",
          ":exception-type": "ValidationException",
        },
        { message: "Improperly formed request." },
      ),
    ]),
  );

  const stream = await kiroAdapter.sendStream(
    req,
    { apiKey: "k" },
    "claude-sonnet-5",
  );

  await expect(drain(stream)).rejects.toThrow(/ValidationException/);
});

test("codeEvent content is forwarded as assistant text", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("codeEvent", { content: "const x = 1;" }),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );
  expect(chunks.map((c) => c.delta ?? "").join("")).toBe("const x = 1;");
});

test("reasoning is emitted on the reasoning channel, not as content", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("reasoningContentEvent", { reasoningText: { text: "hmm" } }),
      buildFrame("assistantResponseEvent", { content: "answer" }),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  expect(chunks.map((c) => c.reasoning ?? "").join("")).toBe("hmm");
  expect(chunks.map((c) => c.delta ?? "").join("")).toBe("answer");
});

test("tool args are not emitted twice when stop and messageStop both flush", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("toolUseEvent", {
        toolUseId: "t1",
        name: "bash",
        input: { command: "ls" },
        stop: true,
      }),
      buildFrame("messageStopEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const deltas = chunks.filter((c) => c.toolCallDelta);
  expect(deltas.length).toBe(1);
  expect(JSON.parse(deltas[0]?.toolCallDelta?.arguments ?? "")).toEqual({
    command: "ls",
  });
});

test("terminates on the observed trailer sequence without messageStopEvent", async () => {
  // Verified against live Kiro (2026-08): a turn ends with
  // metadataEvent -> contextUsageEvent -> meteringEvent and NO messageStopEvent.
  // AWS then holds the socket open, so EOF never arrives.
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "Halo" }),
      buildFrame("metadataEvent", {}),
      buildFrame("contextUsageEvent", { contextUsagePercentage: 3 }),
      buildFrame("meteringEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  expect(chunks.map((c) => c.delta ?? "").join("")).toBe("Halo");
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("stop");
});

test("trailer frames are not leaked as assistant content", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "hi" }),
      buildFrame("metadataEvent", { conversationId: "abc" }),
      buildFrame("contextUsageEvent", { contextUsagePercentage: 12 }),
      buildFrame("meteringEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  expect(chunks.map((c) => c.delta ?? "").join("")).toBe("hi");
  expect(chunks.map((c) => c.reasoning ?? "").join("")).toBe("");
});

test("tool-call turn still finishes as tool_call on the trailer sequence", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("toolUseEvent", {
        toolUseId: "t1",
        name: "bash",
        input: { command: "ls" },
      }),
      buildFrame("metadataEvent", {}),
      buildFrame("meteringEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const args = chunks
    .filter((c) => c.toolCallDelta)
    .map((c) => c.toolCallDelta?.arguments ?? "")
    .join("");
  expect(JSON.parse(args)).toEqual({ command: "ls" });
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("tool_call");
});

test("terminates when the trailer stops after contextUsageEvent", async () => {
  // Verified against live Kiro (2026-08): meteringEvent is NOT guaranteed. This
  // turn ended at metadataEvent -> contextUsageEvent with the socket held open,
  // so metadataEvent is the only reliable terminal marker.
  mockFetchNoClose(
    concat([
      buildFrame("toolUseEvent", {
        toolUseId: "t1",
        name: "bash",
        input: { command: "ls" },
      }),
      buildFrame("metadataEvent", {}),
      buildFrame("contextUsageEvent", { contextUsagePercentage: 4 }),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const args = chunks
    .filter((c) => c.toolCallDelta)
    .map((c) => c.toolCallDelta?.arguments ?? "")
    .join("");
  expect(JSON.parse(args)).toEqual({ command: "ls" });
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("tool_call");
});

test("terminates when metadataEvent is the only trailer frame", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "done" }),
      buildFrame("metadataEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );
  expect(chunks.map((c) => c.delta ?? "").join("")).toBe("done");
  expect(chunks.find((c) => c.finishReason)?.finishReason).toBe("stop");
});

test("same-chunk trailer frames are still drained for usage before finishing", async () => {
  // metadata/contextUsage/metering usually arrive in one read. Terminating on
  // metadataEvent must not discard a contextUsageEvent already sitting in the
  // queue — the fallback estimate depends on its percentage.
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "hi" }),
      buildFrame("metadataEvent", {}),
      buildFrame("contextUsageEvent", { contextUsagePercentage: 9 }),
      // meteringEvent carries credits, not tokens — see usage.ts.
      buildFrame("meteringEvent", { usage: 1.5, unit: "credit" }),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const finish = chunks.find((c) => c.finishReason);
  expect(finish?.finishReason).toBe("stop");
  // 9% of claude-sonnet-5's 1M context window; output = chars("hi")/4, min 1.
  expect(finish?.usage).toEqual({ inputTokens: 90_000, outputTokens: 1 });
});

test("usageEvent carries real token usage like metricsEvent", async () => {
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "hi" }),
      buildFrame("usageEvent", { inputTokens: 4, outputTokens: 2 }),
      buildFrame("metadataEvent", {}),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const finish = chunks.find((c) => c.finishReason);
  expect(finish?.finishReason).toBe("stop");
  expect(finish?.usage).toEqual({ inputTokens: 4, outputTokens: 2 });
});

test("fallback estimates usage when no token frames arrive", async () => {
  // Variant-3 trailer: metadataEvent -> contextUsageEvent, no meteringEvent
  // and no metricsEvent — Kiro sent no token data at all.
  mockFetchNoClose(
    concat([
      buildFrame("assistantResponseEvent", { content: "Halo" }),
      buildFrame("metadataEvent", {}),
      buildFrame("contextUsageEvent", { contextUsagePercentage: 4 }),
    ]),
  );

  const chunks = await drain(
    await kiroAdapter.sendStream(req, { apiKey: "k" }, "claude-sonnet-5"),
  );

  const finish = chunks.find((c) => c.finishReason);
  expect(finish?.finishReason).toBe("stop");
  // 4% of 1M context; output = chars("Halo")/4, min 1.
  expect(finish?.usage).toEqual({ inputTokens: 40_000, outputTokens: 1 });
});

describe("non-streaming send() usage", () => {
  test("accumulates content and reads real tokens from metricsEvent", async () => {
    mockFetch(
      concat([
        buildFrame("assistantResponseEvent", { content: "Hello" }),
        buildFrame("assistantResponseEvent", { content: " world" }),
        buildFrame("metricsEvent", { inputTokens: 10, outputTokens: 5 }),
        buildFrame("messageStopEvent", {}),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    expect(textPart(res.message.content)).toBe("Hello world");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(res.finishReason).toBe("stop");
  });

  test("estimates usage and stop reason from trailer frames", async () => {
    mockFetch(
      concat([
        buildFrame("assistantResponseEvent", { content: "Hello world" }),
        buildFrame("metadataEvent", {}),
        buildFrame("contextUsageEvent", { contextUsagePercentage: 4 }),
        buildFrame("meteringEvent", { usage: 1.2, unit: "credit" }),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    expect(textPart(res.message.content)).toBe("Hello world");
    // 4% of 1M context; output = chars("Hello world")/4, min 1.
    expect(res.usage).toEqual({ inputTokens: 40_000, outputTokens: 2 });
    expect(res.finishReason).toBe("stop");
  });

  test("reports tool_call finish when a tool use precedes the terminal frame", async () => {
    mockFetch(
      concat([
        buildFrame("toolUseEvent", {
          toolUseId: "t1",
          name: "bash",
          input: { command: "ls" },
        }),
        buildFrame("metadataEvent", {}),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    expect(res.finishReason).toBe("tool_call");
    expect(res.message.content[0]?.type).toBe("tool_call");
  });
});

describe("non-streaming send() completeness", () => {
  test("codeEvent content is appended to the answer", async () => {
    mockFetch(
      concat([
        buildFrame("assistantResponseEvent", { content: "Here is the fix:\n" }),
        buildFrame("codeEvent", { content: "const x = 1;" }),
        buildFrame("messageStopEvent", {}),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    expect(textPart(res.message.content)).toBe(
      "Here is the fix:\nconst x = 1;",
    );
  });

  test("array-form toolUseEvent emits every tool call", async () => {
    mockFetch(
      concat([
        buildFrame("toolUseEvent", [
          { toolUseId: "a", name: "bash", input: { command: "ls" } },
          { toolUseId: "b", name: "read", input: { path: "x.ts" } },
        ]),
        buildFrame("metadataEvent", {}),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    const calls = res.message.content.filter((p) => p.type === "tool_call");
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => (c.type === "tool_call" ? c.name : ""))).toEqual([
      "bash",
      "read",
    ]);
    expect(res.finishReason).toBe("tool_call");
  });

  test("string-fragment tool args accumulate into valid JSON", async () => {
    mockFetch(
      concat([
        buildFrame("toolUseEvent", {
          toolUseId: "t1",
          name: "bash",
          input: '{"comm',
        }),
        buildFrame("toolUseEvent", {
          toolUseId: "t1",
          name: "bash",
          input: 'and":"ls"}',
        }),
        buildFrame("metadataEvent", {}),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    const call = res.message.content.find((p) => p.type === "tool_call");
    if (call?.type !== "tool_call") {
      throw new Error("expected a tool_call part");
    }
    expect(JSON.parse(call.arguments as string)).toEqual({ command: "ls" });
    expect(res.finishReason).toBe("tool_call");
  });

  test("reasoning frames are dropped from the response content", async () => {
    mockFetch(
      concat([
        buildFrame("reasoningContentEvent", { reasoningText: { text: "hmm" } }),
        buildFrame("assistantResponseEvent", { content: "answer" }),
        buildFrame("messageStopEvent", {}),
      ]),
    );

    const res = await kiroAdapter.send(req, { apiKey: "k" }, "claude-sonnet-5");

    expect(textPart(res.message.content)).toBe("answer");
  });
});
