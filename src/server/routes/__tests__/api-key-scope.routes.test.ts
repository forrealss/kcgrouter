import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../../providers/types";

interface ErrorBody {
  error?: { message?: string } | string;
}

/**
 * End-to-end enforcement of per-key scope through the real route handler.
 *
 * The adapter is stubbed so a permitted request still reaches "upstream" and
 * records usage — the point is that a denied one never gets that far.
 */
const fakeAdapter: ProviderAdapter = {
  transport: "command-code",
  async send() {
    return {
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "ok" }],
      },
      usage: { inputTokens: 30, outputTokens: 20 },
      finishReason: "stop" as const,
    };
  },
  async sendStream() {
    return new ReadableStream<CanonicalStreamChunk>({
      start(controller) {
        controller.enqueue({
          delta: "ok",
          finishReason: "stop",
          usage: { inputTokens: 30, outputTokens: 20 },
        });
        controller.close();
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
const ProviderRegistry = await import(
  "../../services/provider-registry.service"
);
const ComboEngine = await import("../../services/combo-engine.service");
const ApiKeyScope = await import("../../services/api-key-scope.service");
const { createApiKey } = await import("../../services/settings.service");
const { v1Routes } = await import("../v1.routes");

let allowedProviderId = "";
let deniedProviderId = "";
let allowedModelRef = "";
let deniedModelRef = "";
let allowedPrefix = "";
let comboName = "";
let comboId = "";
/** A combo whose only member points at the denied provider. */
let deniedComboName = "";

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

  const suffix = Math.random().toString(36).slice(2, 8);

  const allowed = ProviderRegistry.createProvider({
    name: `ScopeAllowed-${suffix}`,
    transport: "command-code",
    baseUrl: "https://example.invalid",
    prefix: `scopeok${suffix}`,
  });
  const allowedAccount = ProviderRegistry.addAccount(allowed.id, {
    label: "ok",
    apiKey: "sk_ok",
  });

  const denied = ProviderRegistry.createProvider({
    name: `ScopeDenied-${suffix}`,
    transport: "command-code",
    baseUrl: "https://example.invalid",
    prefix: `scopeno${suffix}`,
  });
  const deniedAccount = ProviderRegistry.addAccount(denied.id, {
    label: "no",
    apiKey: "sk_no",
  });

  allowedProviderId = allowed.id;
  deniedProviderId = denied.id;
  allowedPrefix = allowed.prefix;
  allowedModelRef = `${allowed.prefix}/good-model`;
  deniedModelRef = `${denied.prefix}/good-model`;

  const combo = ComboEngine.createCombo(`scope-combo-${suffix}`, "fallback");
  ComboEngine.addMember(combo.id, {
    providerAccountId: allowedAccount.id,
    modelName: "good-model",
    priority: 1,
  });
  comboName = combo.name;
  comboId = combo.id;

  const deniedCombo = ComboEngine.createCombo(
    `scope-combo-denied-${suffix}`,
    "fallback",
  );
  ComboEngine.addMember(deniedCombo.id, {
    providerAccountId: deniedAccount.id,
    modelName: "good-model",
    priority: 1,
  });
  deniedComboName = deniedCombo.name;
});

/** Invoke the real route handler with a given key id in the request context. */
function post(model: string, apiKeyId: string | null): Promise<Response> {
  const handler = v1Routes["POST /v1/chat/completions"];
  if (!handler) throw new Error("route not registered");
  return Promise.resolve(
    handler(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
      undefined,
      { apiKeyId },
    ),
  );
}

function errorText(body: ErrorBody): string {
  if (typeof body.error === "string") return body.error;
  return body.error?.message ?? "";
}

async function newKey(label: string) {
  const { id } = await createApiKey(`${label}-${Math.random()}`);
  return id;
}

describe("per-key provider scope", () => {
  test("an unrestricted key reaches any provider", async () => {
    const keyId = await newKey("unrestricted");

    const res = await post(allowedModelRef, keyId);
    expect(res.status).toBe(200);
  });

  test("a request with no key at all is unrestricted", async () => {
    const res = await post(allowedModelRef, null);
    expect(res.status).toBe(200);
  });

  test("a scoped key reaches its allowed provider", async () => {
    const keyId = await newKey("provider-allow");
    ApiKeyScope.updateRestrictions(keyId, {
      allowedProviderIds: [allowedProviderId],
    });

    const res = await post(allowedModelRef, keyId);
    expect(res.status).toBe(200);
  });

  test("a scoped key is refused with 403 on another provider", async () => {
    const keyId = await newKey("provider-deny");
    ApiKeyScope.updateRestrictions(keyId, {
      allowedProviderIds: [allowedProviderId],
    });

    const res = await post(deniedModelRef, keyId);
    expect(res.status).toBe(403);
    expect(errorText((await res.json()) as ErrorBody)).toContain("not allowed");
  });
});

describe("per-key model scope", () => {
  test("allows the listed model and refuses another", async () => {
    const keyId = await newKey("model-scope");
    ApiKeyScope.updateRestrictions(keyId, { allowedModels: ["good-model"] });

    expect((await post(allowedModelRef, keyId)).status).toBe(200);

    const res = await post(`${allowedPrefix}/other-model`, keyId);
    expect(res.status).toBe(403);
    expect(errorText((await res.json()) as ErrorBody)).toContain("other-model");
  });

  test("a prefixed allowlist entry works for a direct request", async () => {
    const keyId = await newKey("model-prefixed");
    ApiKeyScope.updateRestrictions(keyId, {
      allowedModels: [allowedModelRef],
    });

    expect((await post(allowedModelRef, keyId)).status).toBe(200);
  });
});

describe("per-key combo scope", () => {
  test("allows the listed combo", async () => {
    const keyId = await newKey("combo-allow");
    ApiKeyScope.updateRestrictions(keyId, { allowedComboIds: [comboId] });

    expect((await post(comboName, keyId)).status).toBe(200);
  });

  test("refuses an unlisted combo with 403", async () => {
    const keyId = await newKey("combo-deny");
    ApiKeyScope.updateRestrictions(keyId, { allowedComboIds: [comboId] });

    const res = await post(deniedComboName, keyId);
    expect(res.status).toBe(403);
    expect(errorText((await res.json()) as ErrorBody)).toContain("combo");
  });

  test("a combo cannot reach a provider the key is scoped away from", async () => {
    const keyId = await newKey("combo-provider-bypass");
    // The combo itself is permitted, but its member resolves to a provider the
    // key may not use. Checking only the requested string would let this pass.
    ApiKeyScope.updateRestrictions(keyId, {
      allowedProviderIds: [allowedProviderId],
    });

    const res = await post(deniedComboName, keyId);
    expect(res.status).toBe(403);
  });

  test("a combo cannot reach a model the key is scoped away from", async () => {
    const keyId = await newKey("combo-model-bypass");
    // The member's resolved model is "good-model", which is not on this list.
    ApiKeyScope.updateRestrictions(keyId, {
      allowedModels: ["something-else"],
    });

    const res = await post(comboName, keyId);
    expect(res.status).toBe(403);
  });
});

describe("per-key token budget", () => {
  test("usage accrues to the calling key", async () => {
    const keyId = await newKey("budget-accrue");

    await post(allowedModelRef, keyId);

    const restrictions = ApiKeyScope.getRestrictions(keyId);
    expect(restrictions).not.toBeNull();
    // 30 in + 20 out from the stubbed adapter.
    const row = get<{ tokens_used: number; request_count: number }>(
      "SELECT tokens_used, request_count FROM api_keys WHERE id = ?",
      keyId,
    );
    expect(row?.tokens_used).toBe(50);
    expect(row?.request_count).toBe(1);
  });

  test("the request that crosses the cap succeeds, the next is refused", async () => {
    const keyId = await newKey("budget-cap");
    ApiKeyScope.updateRestrictions(keyId, { tokenLimit: 40 });

    // Tokens are only known once the response completes, so this one runs.
    expect((await post(allowedModelRef, keyId)).status).toBe(200);

    const res = await post(allowedModelRef, keyId);
    expect(res.status).toBe(429);
    expect(errorText((await res.json()) as ErrorBody)).toContain("token limit");
  });

  test("resetting usage restores access", async () => {
    const keyId = await newKey("budget-reset");
    ApiKeyScope.updateRestrictions(keyId, { tokenLimit: 40 });
    await post(allowedModelRef, keyId);
    expect((await post(allowedModelRef, keyId)).status).toBe(429);

    ApiKeyScope.resetUsage(keyId);

    expect((await post(allowedModelRef, keyId)).status).toBe(200);
  });

  test("an unrestricted key never runs out", async () => {
    const keyId = await newKey("budget-unlimited");
    await post(allowedModelRef, keyId);
    await post(allowedModelRef, keyId);

    expect((await post(allowedModelRef, keyId)).status).toBe(200);
  });
});

describe("GET /v1/models", () => {
  test("hides models from providers the key may not use", async () => {
    const keyId = await newKey("models-filter");
    ApiKeyScope.updateRestrictions(keyId, {
      allowedProviderIds: [allowedProviderId],
    });

    const handler = v1Routes["GET /v1/models"];
    if (!handler) throw new Error("route not registered");
    const res = await handler(
      new Request("http://localhost/v1/models"),
      undefined,
      { apiKeyId: keyId },
    );
    const body = (await res.json()) as { data: Array<{ owned_by: string }> };

    // Nothing from the denied provider should be advertised.
    const deniedProvider = ProviderRegistry.getProvider(deniedProviderId);
    expect(body.data.some((m) => m.owned_by === deniedProvider?.prefix)).toBe(
      false,
    );
  });
});
