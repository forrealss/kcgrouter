import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  addAccount,
  createProvider,
  deleteProvider,
  getAccount,
  getDecryptedCredential,
  getProvider,
  listAccounts,
  listProviders,
  type NewProviderInput,
  removeAccount,
  updateAccount,
} from "../provider-registry.service";

describe("ProviderRegistry — Provider CRUD", () => {
  beforeAll(() => {
    runMigrations();
    run(
      "DELETE FROM provider_accounts WHERE provider_id IN (SELECT id FROM providers WHERE is_builtin = 0)",
    );
    run("DELETE FROM providers WHERE is_builtin = 0");
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

  afterAll(() => {});

  // Property 12: Round-trip pembuatan dan pembacaan Provider
  test("Property 12: created provider appears in listProviders with correct data", () => {
    const provider = createProvider({
      name: "TestOpenAI",
      transport: "openai",
      baseUrl: "https://api.openai.com/v1",
      prefix: "test-openai",
    });
    const list = listProviders();
    const found = list.find((p) => p.id === provider.id);

    expect(found).toBeDefined();
    if (!found) return;
    expect(found.name).toBe("TestOpenAI");
    expect(found.transport).toBe("openai");
    expect(found.baseUrl).toBe("https://api.openai.com/v1");
    expect(found.accountCount).toBe(0);

    deleteProvider(provider.id);
  });

  // Property 13: Nama Provider duplikat selalu ditolak
  test("Property 13: duplicate provider name is always rejected", () => {
    const p1 = createProvider({
      name: "DuplicateTest",
      transport: "openai",
      baseUrl: "https://a.com",
      prefix: "dup-test",
    });

    expect(() =>
      createProvider({
        name: "DuplicateTest",
        transport: "anthropic",
        baseUrl: "https://b.com",
        prefix: "dup-test-2",
      }),
    ).toThrow(/already exists/);

    deleteProvider(p1.id);
  });

  // Property 14: Transport tidak valid selalu ditolak
  test("Property 14: invalid transport is always rejected", () => {
    expect(() =>
      createProvider({
        name: "Bad",
        transport: "invalid" as NewProviderInput["transport"],
        baseUrl: "https://c.com",
        prefix: "bad",
      }),
    ).toThrow(/Invalid transport/);
  });

  // Property 15: Penghapusan Provider melakukan cascade ke Provider Account
  test("Property 15: deleting provider cascades to provider accounts", () => {
    const provider = createProvider({
      name: "CascadeTest",
      transport: "openai",
      baseUrl: "https://cascade.com",
      prefix: "cascade",
    });

    const acct = addAccount(provider.id, {
      label: "Account 1",
      apiKey: "sk_test_12345",
    });
    expect(getAccount(acct.id)).not.toBeNull();

    deleteProvider(provider.id);
    expect(getAccount(acct.id)).toBeNull();
  });

  test("getProvider returns a single provider with account count", () => {
    const provider = createProvider({
      name: "GetOneTest",
      transport: "openai",
      baseUrl: "https://getone.com",
      prefix: "getone",
    });
    addAccount(provider.id, { label: "Acct", apiKey: "sk_getone" });

    const found = getProvider(provider.id);
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.id).toBe(provider.id);
    expect(found.name).toBe("GetOneTest");
    expect(found.accountCount).toBe(1);

    expect(getProvider("prov_nonexistent")).toBeNull();

    deleteProvider(provider.id);
  });

  test("listProviders returns empty array when no providers exist", () => {
    const list = listProviders();
    expect(Array.isArray(list)).toBe(true);
  });
});

describe("ProviderRegistry — Provider Account CRUD", () => {
  beforeAll(() => {
    runMigrations();
    run(
      "DELETE FROM provider_accounts WHERE provider_id IN (SELECT id FROM providers WHERE is_builtin = 0)",
    );
    run("DELETE FROM providers WHERE is_builtin = 0");
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

  afterAll(() => {});

  // Property 16: Round-trip enkripsi/dekripsi kredensial dan non-eksposur plaintext
  test("Property 16a: getDecryptedCredential returns original API key", () => {
    const provider = createProvider({
      name: "EncTest",
      transport: "openai",
      baseUrl: "https://enc.com",
      prefix: "enc",
    });
    const acct = addAccount(provider.id, {
      label: "Enc Account",
      apiKey: "sk_secret_abc123",
    });

    const cred = getDecryptedCredential(acct.id);
    expect(cred.apiKey).toBe("sk_secret_abc123");

    deleteProvider(provider.id);
  });

  test("Property 16b: provider account never exposes API key plaintext", () => {
    const provider = createProvider({
      name: "LeakTest",
      transport: "openai",
      baseUrl: "https://leak.com",
      prefix: "leak",
    });
    addAccount(provider.id, { label: "Leak Account", apiKey: "sk_leaky_key" });

    const list = listAccounts(provider.id);
    for (const a of list) {
      expect(a).not.toHaveProperty("credentialEnc");
      expect(a).not.toHaveProperty("apiKey");
    }

    deleteProvider(provider.id);
  });

  // Property 17: Validasi quota_limit_tokens
  test("Property 17: quota_limit_tokens validation", () => {
    const provider = createProvider({
      name: "QuotaVal",
      transport: "openai",
      baseUrl: "https://quota.com",
      prefix: "quota",
    });

    // null is valid
    expect(() =>
      addAccount(provider.id, {
        label: "Valid1",
        apiKey: "sk1",
        quotaLimitTokens: null,
      }),
    ).not.toThrow();
    // positive is valid
    expect(() =>
      addAccount(provider.id, {
        label: "Valid2",
        apiKey: "sk2",
        quotaLimitTokens: 1000,
      }),
    ).not.toThrow();
    // zero is invalid
    expect(() =>
      addAccount(provider.id, {
        label: "Invalid1",
        apiKey: "sk3",
        quotaLimitTokens: 0,
      }),
    ).toThrow(/positive/);
    // negative is invalid
    expect(() =>
      addAccount(provider.id, {
        label: "Invalid2",
        apiKey: "sk4",
        quotaLimitTokens: -100,
      }),
    ).toThrow(/positive/);

    deleteProvider(provider.id);
  });

  // Property 18: Update Provider Account mempertahankan identitas
  test("Property 18: updateAccount preserves id and providerId", () => {
    const provider = createProvider({
      name: "IdTest",
      transport: "openai",
      baseUrl: "https://id.com",
      prefix: "idtest",
    });
    const acct = addAccount(provider.id, {
      label: "Original",
      apiKey: "sk_orig",
    });

    const updated = updateAccount(acct.id, { label: "Updated" });
    expect(updated.id).toBe(acct.id);
    expect(updated.providerId).toBe(provider.id);
    expect(updated.label).toBe("Updated");

    deleteProvider(provider.id);
  });

  // Property 19: Penghapusan Provider Account melakukan cascade ke quota_state dan combo_members
  test("Property 19: removing account cascades to quota_state", () => {
    const provider = createProvider({
      name: "CascadeAcct",
      transport: "openai",
      baseUrl: "https://cas.com",
      prefix: "cas",
    });
    const acct = addAccount(provider.id, {
      label: "CasAcct",
      apiKey: "sk_cas",
    });

    // Verify quota_state exists
    const qs = get("SELECT * FROM quota_state WHERE account_id = ?", acct.id);
    expect(qs).not.toBeNull();

    removeAccount(acct.id);

    const qsAfter = get(
      "SELECT * FROM quota_state WHERE account_id = ?",
      acct.id,
    );
    expect(qsAfter).toBeNull();

    deleteProvider(provider.id);
  });

  test("addAccount to non-existent provider throws", () => {
    expect(() =>
      addAccount("prov_nonexistent", { label: "Bad", apiKey: "sk_bad" }),
    ).toThrow(/Provider not found/);
  });

  test("updateAccount on non-existent account throws", () => {
    expect(() => updateAccount("acct_nonexistent", { label: "X" })).toThrow(
      /not found/,
    );
  });

  test("removeAccount on non-existent account throws", () => {
    expect(() => removeAccount("acct_nonexistent")).toThrow(/not found/);
  });
});
