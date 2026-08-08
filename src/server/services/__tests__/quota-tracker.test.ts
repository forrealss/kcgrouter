import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { addAccount, createProvider } from "../provider-registry.service";
import {
  type ErrorKind,
  getState,
  isAvailable,
  markError,
  recordUsage,
} from "../quota-tracker.service";

describe("QuotaTracker", () => {
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

  afterAll(() => {});

  // Helper: create provider + account, return accountId
  function setupAccount(limitTokens: number | null): string {
    const provider = createProvider({
      name: `QuotaTest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      transport: "openai",
      baseUrl: "https://test.com",
      prefix: `quota-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const acct = addAccount(provider.id, {
      label: "Test Account",
      apiKey: "sk_test",
      quotaLimitTokens: limitTokens,
    });
    return acct.id;
  }

  // Property 27: availability iff tokens_used < limit
  test("Property 27a: available when under limit", () => {
    const acctId = setupAccount(1000);
    expect(isAvailable(acctId)).toBe(true);
  });

  test("Property 27b: unavailable when at limit", () => {
    const acctId = setupAccount(100);
    recordUsage(acctId, 100);
    expect(isAvailable(acctId)).toBe(false);
  });

  test("Property 27c: available when limit is null (unlimited)", () => {
    const acctId = setupAccount(null);
    recordUsage(acctId, 999999);
    expect(isAvailable(acctId)).toBe(true);
  });

  // Property 10: error kind maps to correct status
  test("Property 10: error kind maps to correct account status", () => {
    const errorKinds: ErrorKind[] = ["auth", "rate_limit", "server_error"];
    for (const kind of errorKinds) {
      const acctId = setupAccount(10000);
      markError(acctId, kind);
      const row = get<{ status: string }>(
        "SELECT status FROM provider_accounts WHERE id = ?",
        acctId,
      );
      expect(row?.status).toBe("error");
    }
  });

  // Property 11: tokens_used accumulation is consistent
  test("Property 11: tokens_used accumulates correctly", () => {
    const acctId = setupAccount(100000);

    const state0 = getState(acctId);
    expect(state0.tokensUsed).toBe(0);

    recordUsage(acctId, 100);
    const state1 = getState(acctId);
    expect(state1.tokensUsed).toBe(100);

    recordUsage(acctId, 250);
    const state2 = getState(acctId);
    expect(state2.tokensUsed).toBe(350);

    recordUsage(acctId, 150);
    const state3 = getState(acctId);
    expect(state3.tokensUsed).toBe(500);
    expect(state3.requestCount).toBe(3);
  });

  test("getState throws for non-existent account", () => {
    expect(() => getState("acct_nonexistent")).toThrow(/not found/);
  });
});
