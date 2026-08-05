import { expect, test } from "bun:test";
import type { CanonicalRequest } from "../../types";
import { kiroAdapter } from "../adapter";

/**
 * Captures the JSON body the adapter sends upstream so payload shape can be
 * asserted directly. Returns a 400 so `send()` fails fast after capture.
 */
function capturePayload(): () => Record<string, unknown> {
  let captured: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    captured = JSON.parse(init.body as string);
    return new Response("{}", { status: 400 });
  }) as unknown as typeof fetch;
  return () => captured;
}

async function buildPayload(
  req: CanonicalRequest,
): Promise<Record<string, unknown>> {
  const get = capturePayload();
  await kiroAdapter
    .send(req, { apiKey: "k" }, "claude-sonnet-5")
    .catch(() => {});
  return get();
}

type KiroUserMessage = {
  userInputMessage?: {
    content?: string;
    userInputMessageContext?: {
      toolResults?: Array<{
        toolUseId: string;
        status: string;
        content: unknown;
      }>;
      tools?: Array<{
        toolSpecification?: {
          name?: string;
          inputSchema?: { json?: Record<string, unknown> };
        };
      }>;
    };
  };
};

function conversationState(payload: Record<string, unknown>) {
  return payload.conversationState as {
    currentMessage: KiroUserMessage;
    history: KiroUserMessage[];
  };
}

test("tool result content is a [{ text }] block array, not a bare string", async () => {
  // Kiro rejects a toolResult whose content is a plain string with
  // 400 "Improperly formed request".
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "list files" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "t1",
            name: "bash",
            arguments: { command: "ls" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool_result", toolCallId: "t1", content: "total 196" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "thanks" }] },
    ],
  });

  const state = conversationState(payload);
  const withResults = [...state.history, state.currentMessage].find(
    (m) => m.userInputMessage?.userInputMessageContext?.toolResults,
  );
  const results =
    withResults?.userInputMessage?.userInputMessageContext?.toolResults;

  expect(results).toBeDefined();
  expect(results?.[0]?.content).toEqual([{ text: "total 196" }]);
});

test("empty tool result content falls back to a placeholder", async () => {
  // content: [{ text: "" }] is also rejected by Kiro.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "run" }] },
      {
        role: "assistant",
        content: [{ type: "tool_call", id: "t1", name: "bash", arguments: {} }],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolCallId: "t1", content: "" }],
      },
    ],
  });

  const state = conversationState(payload);
  const results =
    state.currentMessage.userInputMessage?.userInputMessageContext?.toolResults;

  expect(results?.[0]?.content).toEqual([{ text: "(no output)" }]);
});

test("tool schemas drop keys Kiro rejects", async () => {
  const payload = await buildPayload({
    stream: false,
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    tools: [
      {
        name: "bash",
        description: "Run a command",
        parameters: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          additionalProperties: false,
          required: [],
          properties: {
            command: { type: "string" },
            opts: {
              type: "object",
              additionalProperties: false,
              anyOf: [{ type: "string" }],
              properties: { cwd: { type: "string" } },
            },
          },
        },
      },
    ],
  });

  const state = conversationState(payload);
  const tools =
    state.currentMessage.userInputMessage?.userInputMessageContext?.tools ??
    state.history[0]?.userInputMessage?.userInputMessageContext?.tools;

  const schema = tools?.[0]?.toolSpecification?.inputSchema?.json;
  expect(schema).toBeDefined();

  const flat = JSON.stringify(schema);
  expect(flat).not.toContain("additionalProperties");
  expect(flat).not.toContain("$schema");
  expect(flat).not.toContain("anyOf");

  // Nested properties must survive sanitization.
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  expect(props?.command).toEqual({ type: "string" });
});

test("tool results in user-role messages are preserved (Anthropic shape)", async () => {
  // The Anthropic translator puts tool_result blocks in *user* messages, paired
  // with a preceding assistant tool_use.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "t9",
            name: "bash",
            arguments: { command: "ls" },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", toolCallId: "t9", content: "ok" }],
      },
    ],
  });

  const state = conversationState(payload);
  const all = [...state.history, state.currentMessage];
  const results = all
    .map((m) => m.userInputMessage?.userInputMessageContext?.toolResults)
    .find((r) => r && r.length > 0);

  expect(results?.[0]?.toolUseId).toBe("t9");
  expect(results?.[0]?.content).toEqual([{ text: "ok" }]);
});

test("tools live on currentMessage, not on history turns", async () => {
  // Kiro validates toolUses/toolResults in history against the tools schema on
  // currentMessage. Leaving the schema on a history turn is rejected.
  const payload = await buildPayload({
    stream: false,
    tools: [
      { name: "bash", description: "run", parameters: { type: "object" } },
    ],
    messages: [
      { role: "user", content: [{ type: "text", text: "list files" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "t1",
            name: "bash",
            arguments: { command: "ls" },
          },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolCallId: "t1", content: "out" }],
      },
      { role: "user", content: [{ type: "text", text: "now what" }] },
    ],
  });

  const state = conversationState(payload);

  // currentMessage must carry the schema.
  expect(
    state.currentMessage.userInputMessage?.userInputMessageContext?.tools,
  ).toBeDefined();

  // No history turn may carry it.
  for (const item of state.history) {
    expect(
      item.userInputMessage?.userInputMessageContext?.tools,
    ).toBeUndefined();
  }
});

test("history starts with a user turn", async () => {
  // Kiro returns "Improperly formed request" for assistant-first history.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "assistant", content: [{ type: "text", text: "I begin" }] },
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ],
  });

  const state = conversationState(payload);
  if (state.history.length > 0) {
    expect(state.history[0]?.userInputMessage).toBeDefined();
  }
});

test("history alternates user/assistant turns", async () => {
  // Two consecutive user turns require a synthetic assistant turn between them.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "one" }] },
      { role: "user", content: [{ type: "text", text: "two" }] },
      { role: "user", content: [{ type: "text", text: "three" }] },
    ],
  });

  const state = conversationState(payload);
  for (let i = 1; i < state.history.length; i++) {
    const prev = state.history[i - 1];
    const cur = state.history[i];
    const bothUser = prev?.userInputMessage && cur?.userInputMessage;
    expect(bothUser).toBeFalsy();
  }
});

test("orphaned tool results degrade to text", async () => {
  // A tool result with no preceding assistant toolUses is rejected, so it must
  // be inlined as text instead.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "tool",
        content: [
          { type: "tool_result", toolCallId: "ghost", content: "orphan" },
        ],
      },
    ],
  });

  const state = conversationState(payload);
  const all = [...state.history, state.currentMessage];

  // No toolResults may survive without a preceding assistant toolUses.
  for (let i = 0; i < all.length; i++) {
    const results =
      all[i]?.userInputMessage?.userInputMessageContext?.toolResults;
    if (!results) continue;
    const prev = all[i - 1];
    expect(prev?.assistantResponseMessage?.toolUses?.length).toBeGreaterThan(0);
  }

  // The text must be preserved somewhere.
  expect(JSON.stringify(payload)).toContain("orphan");
});

test("tools are synthesized from history when the caller omits them", async () => {
  // Kiro rejects history referencing toolUses without a tools schema, even when
  // the client sent no tools on this turn.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "t1",
            name: "bash",
            arguments: { command: "ls" },
          },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolCallId: "t1", content: "out" }],
      },
    ],
  });

  const state = conversationState(payload);
  const tools =
    state.currentMessage.userInputMessage?.userInputMessageContext?.tools;

  expect(tools?.length).toBeGreaterThan(0);
  expect(tools?.[0]?.toolSpecification?.name).toBe("bash");
});

test("tool results are placed before the next assistant turn, not at the end", async () => {
  // When the OpenAI history is:
  //   [system, user, assistant(tool_calls), tool, tool, tool, assistant(text)]
  // the tool results must appear BEFORE the second assistant, not after it.
  // Otherwise Kiro sees tool_uses with no following tool_results and returns
  // 400 TOOL_USE_RESULT_MISMATCH.
  const payload = await buildPayload({
    stream: false,
    messages: [
      { role: "user", content: [{ type: "text", text: "list files" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: "t1",
            name: "bash",
            arguments: { command: "ls" },
          },
          {
            type: "tool_call",
            id: "t2",
            name: "read",
            arguments: { path: "x.ts" },
          },
          {
            type: "tool_call",
            id: "t3",
            name: "read",
            arguments: { path: "y.ts" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool_result", toolCallId: "t1", content: "output1" },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool_result", toolCallId: "t2", content: "output2" },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool_result", toolCallId: "t3", content: "output3" },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Here is the result" }],
      },
    ],
  });

  const state = conversationState(payload);
  const all = [...state.history, state.currentMessage];

  // Find the assistant with toolUses — its immediate successor must have toolResults
  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    if (!item.assistantResponseMessage?.toolUses?.length) continue;

    const next = all[i + 1];
    expect(next?.userInputMessage).toBeDefined();
    expect(
      next?.userInputMessage?.userInputMessageContext?.toolResults,
    ).toBeDefined();
    const results =
      next?.userInputMessage?.userInputMessageContext?.toolResults;
    expect(Array.isArray(results) ? results.length : 0).toBe(3);
    break;
  }
});
