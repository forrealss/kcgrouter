import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import type { CanonicalRequest } from "../../types";
import { QODER_CHAT_URL_ENCODED, QODER_MODEL_LIST_URL } from "../constants";
import { buildCosyHeaders } from "../cosy";
import { qoderEncodeBody } from "../encoding";
import { buildQoderRequestBody, normalizeMessages } from "../payload";

describe("qoderEncodeBody", () => {
  test("preserves base64 length (input length divisible by 3)", () => {
    const input = Buffer.from("abcdef", "utf8"); // 6 bytes → 8 base64 chars
    const encoded = qoderEncodeBody(input);
    expect(encoded.length).toBe(8);
  });

  test("preserves base64 length (input length not divisible by 3)", () => {
    const input = Buffer.from("hello", "utf8"); // 5 bytes → 8 base64 chars (with padding)
    const encoded = qoderEncodeBody(input);
    expect(encoded.length).toBe(8);
  });

  test("handles empty input without throwing", () => {
    const encoded = qoderEncodeBody(Buffer.alloc(0));
    expect(encoded).toBe("");
  });

  test("accepts string and Buffer inputs equivalently", () => {
    const a = qoderEncodeBody("hello");
    const b = qoderEncodeBody(Buffer.from("hello", "utf8"));
    expect(a).toBe(b);
  });

  test("only emits characters from the custom alphabet", () => {
    const allowed = new Set(
      "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!$",
    );
    const encoded = qoderEncodeBody(
      "hello world this is a longer string for testing 0123456789",
    );
    for (const ch of encoded) {
      expect(
        allowed.has(ch),
        `unexpected char in output: ${JSON.stringify(ch)}`,
      ).toBe(true);
    }
  });

  test("is deterministic for identical input", () => {
    expect(qoderEncodeBody("abc")).toBe(qoderEncodeBody("abc"));
  });

  test("produces different output for different input", () => {
    expect(qoderEncodeBody("abc")).not.toBe(qoderEncodeBody("xyz"));
  });
});

describe("buildCosyHeaders", () => {
  const creds = {
    userId: "test-user-id",
    authToken: "dt-test-token",
    name: "Test",
    email: "test@example.com",
    machineId: "fixed-machine-id",
  };

  test("produces all required Cosy-* headers", () => {
    const headers = buildCosyHeaders(
      Buffer.alloc(0),
      QODER_MODEL_LIST_URL,
      creds,
    );
    const required = [
      "Authorization",
      "Cosy-Key",
      "Cosy-User",
      "Cosy-Date",
      "Cosy-Version",
      "Cosy-Machineid",
      "Cosy-Machinetoken",
      "Cosy-Machinetype",
      "Cosy-Machineos",
      "Cosy-Clienttype",
      "Cosy-Clientip",
      "Cosy-Bodyhash",
      "Cosy-Bodylength",
      "Cosy-Sigpath",
      "Cosy-Data-Policy",
      "Login-Version",
      "X-Request-Id",
    ];
    for (const key of required) {
      expect(headers[key], `missing header ${key}`).toBeDefined();
    }
  });

  test("Authorization is a Bearer COSY token with payload+sig", () => {
    const headers = buildCosyHeaders(
      Buffer.alloc(0),
      QODER_MODEL_LIST_URL,
      creds,
    );
    expect(headers.Authorization).toMatch(
      /^Bearer COSY\.[A-Za-z0-9+/=]+\.[a-f0-9]{32}$/,
    );
  });

  test("Cosy-Sigpath strips the leading /algo prefix", () => {
    const headers = buildCosyHeaders(
      Buffer.alloc(0),
      QODER_MODEL_LIST_URL,
      creds,
    );
    expect(headers["Cosy-Sigpath"]).toBe("/api/v2/model/list");
  });

  test("Cosy-Sigpath also handles the encoded chat URL", () => {
    const headers = buildCosyHeaders(
      Buffer.from("body", "utf8"),
      QODER_CHAT_URL_ENCODED,
      creds,
    );
    expect(headers["Cosy-Sigpath"]).toBe(
      "/api/v2/service/pro/sse/agent_chat_generation",
    );
  });

  test("Cosy-Bodyhash is the MD5 of the request body, Cosy-Bodylength is the length", () => {
    const body = Buffer.from("hello qoder", "utf8");
    const headers = buildCosyHeaders(body, QODER_MODEL_LIST_URL, creds);
    const expectedHash = createHash("md5").update(body).digest("hex");
    expect(headers["Cosy-Bodyhash"]).toBe(expectedHash);
    expect(headers["Cosy-Bodylength"]).toBe(String(body.length));
  });

  test("empty body produces the canonical empty-MD5 hash", () => {
    const headers = buildCosyHeaders(
      Buffer.alloc(0),
      QODER_MODEL_LIST_URL,
      creds,
    );
    expect(headers["Cosy-Bodyhash"]).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(headers["Cosy-Bodylength"]).toBe("0");
  });

  test("Cosy-Machineid + Cosy-Machinetoken match the supplied machineId", () => {
    const headers = buildCosyHeaders(
      Buffer.alloc(0),
      QODER_MODEL_LIST_URL,
      creds,
    );
    expect(headers["Cosy-Machineid"]).toBe("fixed-machine-id");
    expect(headers["Cosy-Machinetoken"]).toBe("fixed-machine-id");
  });

  test("auto-generates a machineId when none is supplied", () => {
    const headers = buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, {
      ...creds,
      machineId: "",
    });
    expect(headers["Cosy-Machineid"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("throws when userId is missing", () => {
    expect(() =>
      buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, {
        ...creds,
        userId: "",
      }),
    ).toThrow(/user id is empty/);
  });

  test("throws when authToken is missing", () => {
    expect(() =>
      buildCosyHeaders(Buffer.alloc(0), QODER_MODEL_LIST_URL, {
        ...creds,
        authToken: "",
      }),
    ).toThrow(/auth token is empty/);
  });

  test("Cosy-User reflects the supplied userId verbatim", () => {
    const headers = buildCosyHeaders(
      Buffer.alloc(0),
      QODER_MODEL_LIST_URL,
      creds,
    );
    expect(headers["Cosy-User"]).toBe("test-user-id");
  });

  test("two calls with identical inputs differ only in fresh-randomness fields", () => {
    const a = buildCosyHeaders(
      Buffer.from("payload", "utf8"),
      QODER_CHAT_URL_ENCODED,
      creds,
    );
    const b = buildCosyHeaders(
      Buffer.from("payload", "utf8"),
      QODER_CHAT_URL_ENCODED,
      creds,
    );
    expect(a["Cosy-User"]).toBe(b["Cosy-User"]);
    expect(a["Cosy-Bodyhash"]).toBe(b["Cosy-Bodyhash"]);
    expect(a["Cosy-Bodylength"]).toBe(b["Cosy-Bodylength"]);
    expect(a["Cosy-Sigpath"]).toBe(b["Cosy-Sigpath"]);
    expect(a["Cosy-Machineid"]).toBe(b["Cosy-Machineid"]);
    expect(a["X-Request-Id"]).not.toBe(b["X-Request-Id"]);
  });
});

describe("normalizeMessages", () => {
  test("hoists role:system out of messages into systemText", () => {
    const result = normalizeMessages([
      { role: "system", content: "you are helpful" },
      { role: "user", content: "hi" },
    ]);
    expect(result.systemText).toBe("you are helpful");
    expect(result.messages).toHaveLength(1);
    expect((result.messages[0] as { role: string }).role).toBe("user");
  });

  test("flattens multipart text content into a string", () => {
    const result = normalizeMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
      },
    ]);
    expect((result.messages[0] as { content: string }).content).toBe(
      "part1\npart2",
    );
  });

  test("joins multiple system messages with a blank line", () => {
    const result = normalizeMessages([
      { role: "system", content: "rule 1" },
      { role: "system", content: "rule 2" },
      { role: "user", content: "hi" },
    ]);
    expect(result.systemText).toBe("rule 1\n\nrule 2");
  });

  test("returns empty results for empty input", () => {
    const result = normalizeMessages([]);
    expect(result.messages).toEqual([]);
    expect(result.systemText).toBe("");
  });
});

describe("buildQoderRequestBody", () => {
  const modelConfig = {
    key: "ultimate",
    is_reasoning: false,
    max_output_tokens: 8192,
  };

  function makeRequest(
    overrides: Partial<CanonicalRequest> = {},
  ): CanonicalRequest {
    return {
      messages: [
        { role: "system", content: [{ type: "text", text: "be terse" }] },
        { role: "user", content: [{ type: "text", text: "hello qoder" }] },
      ],
      stream: true,
      ...overrides,
    };
  }

  test("strips the qoder/ model prefix", () => {
    const plan = buildQoderRequestBody(
      makeRequest(),
      "qoder/ultimate",
      modelConfig,
      "u1",
    );
    expect(plan.qoderKey).toBe("ultimate");
  });

  test("hoists system text and keeps the user message", () => {
    const plan = buildQoderRequestBody(
      makeRequest(),
      "ultimate",
      modelConfig,
      "u1",
    );
    const payload = plan.payload;
    expect(payload.system).toBe("be terse");
    expect(Array.isArray(payload.messages)).toBe(true);
    const roles = (payload.messages as Array<{ role: string }>).map(
      (m) => m.role,
    );
    expect(roles).toEqual(["user"]);
  });

  test("mirrors the model config in model_config + chat_context.extra", () => {
    const plan = buildQoderRequestBody(
      makeRequest(),
      "ultimate",
      modelConfig,
      "u1",
    );
    const payload = plan.payload;
    const mc = payload.model_config as { key: string; is_reasoning: boolean };
    expect(mc.key).toBe("ultimate");
    expect(mc.is_reasoning).toBe(false);
    const extra = (
      payload.chat_context as {
        extra: { modelConfig: { key: string } };
      }
    ).extra;
    expect(extra.modelConfig.key).toBe("ultimate");
  });

  test("caps max_tokens at the request maxTokens when smaller than the model cap", () => {
    const plan = buildQoderRequestBody(
      makeRequest({ maxTokens: 128 }),
      "ultimate",
      modelConfig,
      "u1",
    );
    const parameters = plan.payload.parameters as { max_tokens: number };
    expect(parameters.max_tokens).toBe(128);
  });

  test("keeps the model cap when the request has no maxTokens", () => {
    const plan = buildQoderRequestBody(
      makeRequest(),
      "ultimate",
      modelConfig,
      "u1",
    );
    const parameters = plan.payload.parameters as { max_tokens: number };
    expect(parameters.max_tokens).toBe(8192);
  });

  test("includes tools when provided", () => {
    const plan = buildQoderRequestBody(
      makeRequest({
        tools: [{ name: "get_weather", description: "Weather lookup" }],
      }),
      "ultimate",
      modelConfig,
      "u1",
    );
    expect(Array.isArray(plan.payload.tools)).toBe(true);
    expect((plan.payload.tools as unknown[]).length).toBe(1);
  });
});
