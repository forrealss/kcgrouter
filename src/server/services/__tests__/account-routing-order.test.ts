import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../../providers/types";

// Which credential actually served the request.
let served: string[] = [];

const fakeAdapter: ProviderAdapter = {
  transport: "command-code",
  async send(_req, credential) {
    served.push(credential.apiKey);
    return {
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "ok" }],
      },
      usage: { inputTokens: 5, outputTokens: 5 },
      finishReason: "stop" as const,
    };
  },
  async sendStream() {
    return new ReadableStream<CanonicalStreamChunk>({
      start(c) {
        c.close();
      },
    });
  },
};
mock.module("../../providers/registry", () => ({
  getAdapter: () => fakeAdapter,
  adapterRegistry: { "command-code": fakeAdapter },
}));

const { runMigrations } = await import("../../../db/migrations");
const { get, run } = await import("../../../db/client");
const PR = await import("../provider-registry.service");
const { handleChatRequest } = await import("../router.service");

let prefix = "";
let providerId = "";
let first = "";
let second = "";

beforeAll(() => {
  runMigrations();
  if (!get("SELECT * FROM app_settings WHERE id = 1")) {
    run(
      "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
      "",
      "light",
      0,
      new Date().toISOString(),
      new Date().toISOString(),
    );
  }
  const s = Math.random().toString(36).slice(2, 8);
  const p = PR.createProvider({
    name: `OrderE2E-${s}`,
    transport: "command-code",
    baseUrl: "https://x.invalid",
    prefix: `orde2e${s}`,
  });
  prefix = p.prefix;
  providerId = p.id;
  first = PR.addAccount(p.id, { label: "first", apiKey: "sk_first" }).id;
  second = PR.addAccount(p.id, { label: "second", apiKey: "sk_second" }).id;
});

async function callIt() {
  served = [];
  const r = await handleChatRequest({
    rawBody: {
      model: `${prefix}/m`,
      messages: [{ role: "user", content: "hi" }],
    },
    sourceFormat: "openai",
    targetSelector: `${prefix}/m`,
    stream: false,
  });
  return r;
}

describe("ordering and disable, end to end through the router", () => {
  test("the topmost connection serves the request", async () => {
    await callIt();
    expect(served).toEqual(["sk_first"]);
  });

  test("reordering changes which one serves it", async () => {
    PR.reorderAccounts(providerId, [second, first]);
    await callIt();
    expect(served).toEqual(["sk_second"]);
  });

  test("disabling the top one falls through to the next", async () => {
    PR.updateAccount(second, { enabled: false });
    await callIt();
    expect(served).toEqual(["sk_first"]);
  });

  test("disabling every connection returns 503 with a disabled-specific message", async () => {
    PR.updateAccount(first, { enabled: false });
    const r = await callIt();
    expect(r.status).toBe(503);
    expect(served).toEqual([]);
    expect(JSON.stringify(r.body)).toContain("disabled");
  });

  test("re-enabling puts it back in rotation", async () => {
    PR.updateAccount(first, { enabled: true });
    const r = await callIt();
    expect(r.status).toBe(200);
    expect(served).toEqual(["sk_first"]);
  });
});
