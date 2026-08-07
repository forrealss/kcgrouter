import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import type { CanonicalResponse } from "../../providers/types";
import { fromCanonical, toCanonical } from "../format-translator.service";

describe("FormatTranslator — OpenAI", () => {
  beforeAll(() => {
    runMigrations();
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  });

  // Property 1
  test("Property 1: OpenAI body produces valid CanonicalRequest", () => {
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      stream: false,
      max_tokens: 1000,
      temperature: 0.7,
    };

    const canonical = toCanonical(body, "openai");
    expect(canonical.messages.length).toBe(2);
    const msg0 = canonical.messages[0];
    expect(msg0?.role).toBe("user");
    const part0 = msg0?.content[0];
    expect(part0?.type).toBe("text");
    expect((part0 as { type: "text"; text: string }).text).toBe("Hello");
    expect(canonical.modelHint).toBe("gpt-4o");
    expect(canonical.stream).toBe(false);
  });

  // Property 1 — tool calls
  test("Property 1: OpenAI with tool_calls", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "search", arguments: '{"q":"test"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "results" },
      ],
      stream: false,
    };

    const canonical = toCanonical(body, "openai");
    expect(canonical.messages[0]?.content[0]?.type).toBe("tool_call");
    expect(canonical.messages[1]?.content[0]?.type).toBe("tool_result");
  });

  // Property 3
  test("Property 3: round-trip OpenAI response", () => {
    const response: CanonicalResponse = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    };

    const openaiResp = fromCanonical(response, "openai") as Record<
      string,
      unknown
    >;
    expect(openaiResp.choices).toBeDefined();
    const choices = openaiResp.choices as {
      message: { content: string };
      finish_reason: string;
    }[];
    expect(choices[0]?.message.content).toBe("Hello!");
    expect(choices[0]?.finish_reason).toBe("stop");
  });

  // Property 4 — invalid payload
  test("Property 4: invalid OpenAI body throws", () => {
    expect(() => toCanonical({ not_messages: true }, "openai")).toThrow(
      /missing messages/,
    );
    expect(() => toCanonical(null, "openai")).toThrow();
  });
});

describe("FormatTranslator — Anthropic", () => {
  // Property 2
  test("Property 2: Anthropic body produces valid CanonicalRequest", () => {
    const body = {
      model: "claude-3-opus",
      system: "You are helpful",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 2000,
      stream: false,
    };

    const canonical = toCanonical(body, "anthropic");
    expect(canonical.messages[0]?.role).toBe("system");
    expect(canonical.messages[1]?.role).toBe("user");
    expect(canonical.modelHint).toBe("claude-3-opus");
  });

  test("Property 2: Anthropic with tool use", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu_1", name: "calc", input: { x: 1 } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tu_1", content: "42" },
          ],
        },
      ],
      stream: false,
    };

    const canonical = toCanonical(body, "anthropic");
    expect(canonical.messages[0]?.content[0]?.type).toBe("tool_call");
    expect(canonical.messages[1]?.content[0]?.type).toBe("tool_result");
  });

  test("Property 3: round-trip Anthropic response", () => {
    const response: CanonicalResponse = {
      message: { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
      usage: { inputTokens: 20, outputTokens: 10 },
      finishReason: "stop",
    };

    const anthropicResp = fromCanonical(response, "anthropic") as Record<
      string,
      unknown
    >;
    expect(anthropicResp.type).toBe("message");
    expect(anthropicResp.stop_reason).toBe("end_turn");
  });

  test("Property 4: invalid Anthropic body throws", () => {
    expect(() => toCanonical({ messages: "not_array" }, "anthropic")).toThrow(
      /missing messages/,
    );
  });
});
