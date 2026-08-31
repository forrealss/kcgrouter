import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  checkTarget,
  getRestrictions,
  hasBudget,
  recordUsage,
  resetUsage,
  toRestrictions,
  UNRESTRICTED,
  updateRestrictions,
} from "../api-key-scope.service";
import { createApiKey, listApiKeys } from "../settings.service";

/** A key row created directly, so each test starts from a known scope. */
async function makeKey(label = `scope-${Date.now()}-${Math.random()}`) {
  const { id } = await createApiKey(label);
  return id;
}

const target = {
  providerId: "prov_openai",
  providerName: "OpenAI",
  providerPrefix: "openai",
  modelName: "gpt-4o",
  comboId: null as string | null,
};

describe("ApiKeyScope", () => {
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

  describe("defaults", () => {
    test("a new key is unrestricted, preserving pre-019 behaviour", async () => {
      const id = await makeKey();
      const restrictions = getRestrictions(id);

      expect(restrictions).toEqual(UNRESTRICTED);
      expect(checkTarget(restrictions ?? UNRESTRICTED, target)).toBeNull();
      expect(hasBudget(id)).toBe(true);
    });

    test("getRestrictions returns null for an unknown key", () => {
      expect(getRestrictions("key_missing")).toBeNull();
    });
  });

  describe("provider scope", () => {
    test("allows a listed provider and denies an unlisted one", async () => {
      const id = await makeKey();
      const restrictions = updateRestrictions(id, {
        allowedProviderIds: ["prov_openai"],
      });

      expect(checkTarget(restrictions, target)).toBeNull();

      const denial = checkTarget(restrictions, {
        ...target,
        providerId: "prov_anthropic",
        providerName: "Anthropic",
      });
      expect(denial?.reason).toBe("provider");
      expect(denial?.message).toContain("Anthropic");
    });

    test("an empty list denies everything, unlike null", async () => {
      const id = await makeKey();
      const restrictions = updateRestrictions(id, { allowedProviderIds: [] });

      expect(restrictions.allowedProviderIds).toEqual([]);
      expect(checkTarget(restrictions, target)?.reason).toBe("provider");
    });
  });

  describe("model scope", () => {
    test("matches a bare model name", async () => {
      const id = await makeKey();
      const restrictions = updateRestrictions(id, {
        allowedModels: ["gpt-4o"],
      });

      expect(checkTarget(restrictions, target)).toBeNull();
      expect(
        checkTarget(restrictions, { ...target, modelName: "gpt-4o-mini" })
          ?.reason,
      ).toBe("model");
    });

    test("a prefixed allowlist entry matches the bare model a combo resolves to", async () => {
      const id = await makeKey();
      // The UI offers "openai/gpt-4o" because that is what GET /v1/models
      // advertises, but a combo member stores just "gpt-4o".
      const restrictions = updateRestrictions(id, {
        allowedModels: ["openai/gpt-4o"],
      });

      expect(checkTarget(restrictions, target)).toBeNull();
    });

    test("a bare allowlist entry matches an already-prefixed model name", async () => {
      const id = await makeKey();
      const restrictions = updateRestrictions(id, {
        allowedModels: ["gpt-4o"],
      });

      expect(
        checkTarget(restrictions, {
          ...target,
          modelName: "openai/gpt-4o",
          providerPrefix: null,
        }),
      ).toBeNull();
    });
  });

  describe("combo scope", () => {
    test("only applies to combo-routed requests", async () => {
      const id = await makeKey();
      const restrictions = updateRestrictions(id, {
        allowedComboIds: ["combo_allowed"],
      });

      // A prefix route carries no combo, so the combo list must not block it.
      expect(checkTarget(restrictions, target)).toBeNull();

      expect(
        checkTarget(restrictions, { ...target, comboId: "combo_allowed" }),
      ).toBeNull();

      const denial = checkTarget(restrictions, {
        ...target,
        comboId: "combo_other",
        comboName: "Other",
      });
      expect(denial?.reason).toBe("combo");
    });
  });

  describe("partial updates", () => {
    test("editing the token limit leaves the allowlists intact", async () => {
      const id = await makeKey();
      updateRestrictions(id, {
        allowedProviderIds: ["prov_openai"],
        allowedModels: ["gpt-4o"],
      });

      const after = updateRestrictions(id, { tokenLimit: 1000 });

      expect(after.allowedProviderIds).toEqual(["prov_openai"]);
      expect(after.allowedModels).toEqual(["gpt-4o"]);
      expect(after.tokenLimit).toBe(1000);
    });

    test("an explicit null clears a list back to unrestricted", async () => {
      const id = await makeKey();
      updateRestrictions(id, { allowedProviderIds: ["prov_openai"] });

      const after = updateRestrictions(id, { allowedProviderIds: null });
      expect(after.allowedProviderIds).toBeNull();
      expect(checkTarget(after, target)).toBeNull();
    });

    test("entries are trimmed and de-duplicated", async () => {
      const id = await makeKey();
      const restrictions = updateRestrictions(id, {
        allowedModels: [" gpt-4o ", "gpt-4o", "", "  "],
      });

      expect(restrictions.allowedModels).toEqual(["gpt-4o"]);
    });

    test("rejects a non-positive token limit", async () => {
      const id = await makeKey();
      expect(() => updateRestrictions(id, { tokenLimit: 0 })).toThrow(
        /positive/,
      );
      expect(() => updateRestrictions(id, { tokenLimit: -5 })).toThrow(
        /positive/,
      );
    });

    test("throws for an unknown key", () => {
      expect(() =>
        updateRestrictions("key_missing", { tokenLimit: 100 }),
      ).toThrow(/not found/);
    });
  });

  describe("token budget", () => {
    test("a null limit is unlimited no matter how much is used", async () => {
      const id = await makeKey();
      recordUsage(id, 1_000_000);

      expect(hasBudget(id)).toBe(true);
    });

    test("budget runs out once usage reaches the limit", async () => {
      const id = await makeKey();
      updateRestrictions(id, { tokenLimit: 100 });

      recordUsage(id, 60);
      expect(hasBudget(id)).toBe(true);

      // Crossing the cap is allowed to complete; the *next* request is refused.
      recordUsage(id, 60);
      expect(hasBudget(id)).toBe(false);
    });

    test("recordUsage tracks tokens and request count separately", async () => {
      const id = await makeKey();
      recordUsage(id, 30);
      recordUsage(id, 12);

      const key = (await listApiKeys()).find((k) => k.id === id);
      expect(key?.tokens_used).toBe(42);
      expect(key?.request_count).toBe(2);
    });

    test("a zero or negative token count still counts as a request", async () => {
      const id = await makeKey();
      recordUsage(id, 0);
      recordUsage(id, -10);

      const key = (await listApiKeys()).find((k) => k.id === id);
      expect(key?.tokens_used).toBe(0);
      expect(key?.request_count).toBe(2);
    });

    test("resetUsage zeroes the counters and stamps the reset", async () => {
      const id = await makeKey();
      updateRestrictions(id, { tokenLimit: 100 });
      recordUsage(id, 500);
      expect(hasBudget(id)).toBe(false);

      resetUsage(id);

      expect(hasBudget(id)).toBe(true);
      const key = (await listApiKeys()).find((k) => k.id === id);
      expect(key?.tokens_used).toBe(0);
      expect(key?.request_count).toBe(0);
      expect(key?.usage_reset_at).not.toBeNull();
      // The limit survives a reset — only the counters clear.
      expect(key?.token_limit).toBe(100);
    });

    test("resetUsage throws for an unknown key", () => {
      expect(() => resetUsage("key_missing")).toThrow(/not found/);
    });

    test("an unknown key has no budget", () => {
      expect(hasBudget("key_missing")).toBe(false);
    });
  });

  describe("createApiKey with restrictions", () => {
    test("applies the scope at creation time", async () => {
      const { id } = await createApiKey(`scoped-${Date.now()}`, {
        allowedProviderIds: ["prov_openai"],
        tokenLimit: 5000,
      });

      const restrictions = getRestrictions(id);
      expect(restrictions?.allowedProviderIds).toEqual(["prov_openai"]);
      expect(restrictions?.tokenLimit).toBe(5000);
      // Untouched lists stay unrestricted rather than becoming empty.
      expect(restrictions?.allowedModels).toBeNull();
    });
  });

  describe("corrupt column handling", () => {
    test("a non-array JSON value reads as unrestricted instead of throwing", async () => {
      const id = await makeKey();
      run("UPDATE api_keys SET allowed_models = ? WHERE id = ?", '"nope"', id);

      expect(getRestrictions(id)?.allowedModels).toBeNull();
    });

    test("malformed JSON reads as unrestricted", async () => {
      const id = await makeKey();
      run("UPDATE api_keys SET allowed_models = ? WHERE id = ?", "{oops", id);

      expect(getRestrictions(id)?.allowedModels).toBeNull();
    });

    test("non-string entries are dropped", () => {
      const restrictions = toRestrictions({
        id: "key_x",
        label: "x",
        key_hash: "",
        key_enc: null,
        key_sha256: null,
        created_at: "",
        last_used_at: null,
        revoked_at: null,
        allowed_provider_ids: '["a", 5, null, "b"]',
        allowed_models: null,
        allowed_combo_ids: null,
        token_limit: null,
        tokens_used: 0,
        request_count: 0,
        usage_reset_at: null,
      });

      expect(restrictions.allowedProviderIds).toEqual(["a", "b"]);
    });
  });
});
