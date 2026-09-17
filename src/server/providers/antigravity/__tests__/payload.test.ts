import { describe, expect, test } from "bun:test";
import type { CanonicalRequest } from "../../types";
import {
  buildAntigravityPayload,
  buildRequestId,
  generateProjectId,
  MAX_OUTPUT_TOKENS,
  sanitizeFunctionName,
} from "../payload";

function baseRequest(
  overrides: Partial<CanonicalRequest> = {},
): CanonicalRequest {
  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ],
    stream: false,
    ...overrides,
  };
}

describe("sanitizeFunctionName", () => {
  test("keeps valid Gemini tool names untouched", () => {
    expect(sanitizeFunctionName("read_file")).toBe("read_file");
    expect(sanitizeFunctionName("mcp_tool.call-1")).toBe("mcp_tool.call-1");
  });

  test("replaces invalid characters and fixes a leading digit", () => {
    expect(sanitizeFunctionName("bad name!")).toBe("bad_name_");
    expect(sanitizeFunctionName("9tool")).toBe("_9tool");
  });

  test("clamps to 64 chars and handles empty names", () => {
    expect(sanitizeFunctionName("x".repeat(100)).length).toBe(64);
    expect(sanitizeFunctionName("")).toBe("_unknown");
  });
});

describe("buildRequestId", () => {
  test("matches the agent/<conversation>/<ts>/<trajectory>/<step> shape", () => {
    const id = buildRequestId("acct_1", "gemini-3.8-flash-medium", 3);
    const parts = id.split("/");
    expect(parts[0]).toBe("agent");
    expect(parts).toHaveLength(5);
    expect(Number(parts[2])).toBeGreaterThan(0);
    // step = contents * 2 - 1
    expect(parts[4]).toBe("5");
  });

  test("is deterministic for the same session key and model", () => {
    const a = buildRequestId("acct_1", "m", 1);
    const b = buildRequestId("acct_1", "m", 1);
    expect(a.split("/")[1]).toBe(b.split("/")[1]);
    expect(a.split("/")[3]).toBe(b.split("/")[3]);
  });
});

describe("generateProjectId", () => {
  test("returns adjective-noun-hash", () => {
    const id = generateProjectId();
    expect(id).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{5}$/);
  });
});

describe("buildAntigravityPayload", () => {
  test("wraps the request in the Cloud Code envelope", () => {
    const payload = buildAntigravityPayload(
      baseRequest(),
      "gemini-3.8-flash-medium",
      { projectId: "proj-1", sessionKey: "acct_1" },
    );

    expect(payload.project).toBe("proj-1");
    expect(payload.model).toBe("gemini-3.8-flash-medium");
    expect(payload.userAgent).toBe("antigravity");
    expect(payload.requestType).toBe("agent");
    expect(typeof payload.requestId).toBe("string");

    const request = payload.request as Record<string, unknown>;
    expect(Array.isArray(request.contents)).toBe(true);
    expect(request.sessionId).toBeDefined();
  });

  test("maps user/assistant roles and merges consecutive same-role turns", () => {
    const payload = buildAntigravityPayload(
      baseRequest({
        messages: [
          { role: "system", content: [{ type: "text", text: "be nice" }] },
          { role: "user", content: [{ type: "text", text: "a" }] },
          { role: "assistant", content: [{ type: "text", text: "b" }] },
          { role: "user", content: [{ type: "text", text: "c" }] },
        ],
      }),
      "m",
      { sessionKey: "k" },
    );

    const request = payload.request as {
      systemInstruction?: { parts: { text: string }[] };
      contents: { role: string; parts: unknown[] }[];
    };

    // System becomes systemInstruction, not a content row
    expect(request.systemInstruction?.parts[0]?.text).toBe("be nice");
    expect(request.contents).toHaveLength(3);
    expect(request.contents.map((c) => c.role)).toEqual([
      "user",
      "model",
      "user",
    ]);
  });

  test("converts tool calls/results into Gemini function parts", () => {
    const payload = buildAntigravityPayload(
      baseRequest({
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_call",
                id: "t1",
                name: "read file",
                arguments: { path: "/x" },
              },
            ],
          },
          {
            role: "user",
            content: [
              { type: "tool_result", toolCallId: "t1", content: "contents" },
            ],
          },
        ],
        tools: [
          {
            name: "read file",
            description: "d",
            parameters: { type: "object", properties: {} },
          },
        ],
      }),
      "m",
      { sessionKey: "k" },
    );

    const request = payload.request as {
      contents: { role: string; parts: Record<string, unknown>[] }[];
      tools: { functionDeclarations: { name: string }[] }[];
      toolConfig: { functionCallingConfig: { mode: string } };
    };

    const [firstContent, secondContent] = request.contents;
    const call = firstContent?.parts[0]?.functionCall as { name: string };
    expect(call?.name).toBe("read_file");
    expect(firstContent?.role).toBe("model");
    // functionResponse must ride in a user role
    expect(secondContent?.role).toBe("user");
    expect(secondContent?.parts[0]?.functionResponse).toBeDefined();

    expect(request.tools[0]?.functionDeclarations[0]?.name).toBe("read_file");
    expect(request.toolConfig.functionCallingConfig.mode).toBe("VALIDATED");
  });

  test("fills a default schema for tools without parameters", () => {
    const payload = buildAntigravityPayload(
      baseRequest({ tools: [{ name: "noop" }] }),
      "m",
      { sessionKey: "k" },
    );
    const request = payload.request as {
      tools: {
        functionDeclarations: { parameters: Record<string, unknown> }[];
      }[];
    };
    expect(request.tools[0]?.functionDeclarations[0]?.parameters.type).toBe(
      "object",
    );
  });

  test("strips blacklisted thinking fields and caps maxOutputTokens", () => {
    const payload = buildAntigravityPayload(
      baseRequest({ maxTokens: MAX_OUTPUT_TOKENS + 1000 }),
      "m",
      { sessionKey: "k" },
    );
    const request = payload.request as Record<string, unknown>;
    expect(request.thinking).toBeUndefined();
    expect(request.reasoning).toBeUndefined();
    const generationConfig = request.generationConfig as {
      maxOutputTokens: number;
    };
    expect(generationConfig.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  test("generates a fallback projectId when none is provided", () => {
    const payload = buildAntigravityPayload(baseRequest(), "m", {
      sessionKey: "k",
    });
    expect(payload.project).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{5}$/);
  });
});
