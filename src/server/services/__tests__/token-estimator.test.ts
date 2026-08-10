import { describe, expect, test } from "bun:test";
import { estimateAnthropicInputTokens } from "../token-estimator.service";

describe("estimateAnthropicInputTokens", () => {
  test("empty body estimates 0 tokens", () => {
    expect(estimateAnthropicInputTokens()).toBe(0);
    expect(estimateAnthropicInputTokens({})).toBe(0);
  });

  test("plain string messages and system estimate ceil(chars / 4)", () => {
    const tokens = estimateAnthropicInputTokens({
      system: "hello world", // 11 chars
      messages: [{ role: "user", content: "hi there" }], // 8 chars
    });
    expect(tokens).toBe(Math.ceil(19 / 4)); // 5
  });

  test("counts tool_use blocks including their nested input", () => {
    const tokens = estimateAnthropicInputTokens({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "ok" }, // 2
            {
              type: "tool_use",
              name: "get_weather", // 11
              input: { city: "NYC" }, // "city" 4 + "NYC" 3 = 7
            },
          ],
        },
      ],
    });
    expect(tokens).toBe(Math.ceil(20 / 4)); // 5
  });

  test("counts tool_result and thinking blocks", () => {
    const tokens = estimateAnthropicInputTokens({
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", content: "it is sunny" }], // 12
        },
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: "let me think" }], // 12
        },
      ],
    });
    expect(tokens).toBe(6); // ceil(24 / 4)
  });

  test("counts tools definitions and system block arrays", () => {
    const tokens = estimateAnthropicInputTokens({
      // Generic object counting also includes the block's key names
      // ("type" + "text"): 4 + 4 + 4 + 8 = 20.
      system: [{ type: "text", text: "be brief" }],
      tools: [
        {
          name: "get_weather", // 11
          input_schema: {
            type: "object", // "type" 4 + "object" 6 = 10
            properties: { city: { type: "string" } }, // "properties" 10 + 14 = 24
          },
        },
      ],
      messages: [],
    });
    // tools object: "name" 4 + "get_weather" 11 + "input_schema" 12 + 34 = 61
    expect(tokens).toBe(21); // ceil((20 + 61) / 4)
  });

  test("ignores non-array messages gracefully", () => {
    expect(
      estimateAnthropicInputTokens({ messages: "not an array" as unknown }),
    ).toBe(0);
  });
});
