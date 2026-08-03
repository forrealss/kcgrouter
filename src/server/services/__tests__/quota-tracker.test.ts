import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  getState,
  isAvailable,
  recordUsage,
  markError,
  type ErrorKind,
} from "../quota-tracker.service";
import { createProvider, addAccount } from "../provider-registry.service";
import { get, run, closeDb } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";

describe("QuotaTracker", () => {
  beforeAll(() => {
    runMigrations();
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  });

  afterAll(() => closeDb());

  // Helper: create provider + account, return accountId
  function setupAccount(resetType: string, limitTokens: number | null): string {
    const provider = createProvider({
      name: `QuotaTest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      transport: "openai",
      baseUrl: "https://test.com",
    });
    const acct = addAccount(provider.id, {
      label: "Test Account",
      apiKey: "sk_test",
      quotaResetType: resetType as "5h" | "daily" | "weekly" | "none",
      quotaLimitTokens: limitTokens,
    });
    return acct.id;
  }

  // Property 25: Rolling window — no change before window_end, reset after
  test("Property 25a: state unchanged when window_end not reached", () => {
    const acctId = setupAccount("daily", 10000);
    const state1 = getState(acctId);
    const state2 = getState(acctId);

    expect(state2.tokensUsed).toBe(state1.tokensUsed);
    expect(state2.requestCount).toBe(state1.requestCount);
    expect(state2.windowStart).toBe(state1.windowStart);
  });

  test("Property 25b: window resets when window_end is in the past", () => {
    const acctId = setupAccount("5h", 10000);

    // Force window_end to the past
    const past = new Date(Date.now() - 1000).toISOString();
    run("UPDATE quota_state SET window_end = ? WHERE account_id = ?", past, acctId);

    recordUsage(acctId, 5000);
    const stateBefore = getState(acctId);
    expect(stateBefore.tokensUsed).toBe(0); // reset happened
    expect(stateBefore.windowEnd).not.toBe(past); // new window_end
  });

  // Property 26: reset_type "none" always available
  test("Property 26: accounts with reset_type 'none' are always available", () => {
    const acctId = setupAccount("none", null);

    expect(isAvailable(acctId)).toBe(true);

    // Use lots of tokens — still available because reset_type is "none"
    for (let i = 0; i < 100; i++) {
      recordUsage(acctId, 1000);
    }
    expect(isAvailable(acctId)).toBe(true);
  });

  // Property 27: availability iff tokens_used < limit
  test("Property 27a: available when under limit", () => {
    const acctId = setupAccount("daily", 1000);
    expect(isAvailable(acctId)).toBe(true);
  });

  test("Property 27b: unavailable when at limit", () => {
    const acctId = setupAccount("daily", 100);
    recordUsage(acctId, 100);
    expect(isAvailable(acctId)).toBe(false);
  });

  test("Property 27c: available when limit is null (unlimited)", () => {
    const acctId = setupAccount("daily", null);
    recordUsage(acctId, 999999);
    expect(isAvailable(acctId)).toBe(true);
  });

  // Property 10: error kind maps to correct status
  test("Property 10: error kind maps to correct account status", () => {
    const errorKinds: ErrorKind[] = ["auth", "rate_limit", "server_error"];
    for (const kind of errorKinds) {
      const acctId = setupAccount("daily", 10000);
      markError(acctId, kind);
      const row = get<{ status: string }>("SELECT status FROM provider_accounts WHERE id = ?", acctId);
      expect(row?.status).toBe("error");
    }
  });

  // Property 11: tokens_used accumulation is consistent
  test("Property 11: tokens_used accumulates correctly", () => {
    const acctId = setupAccount("daily", 100000);

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
  });

  test("getState throws for non-existent account", () => {
    expect(() => getState("acct_nonexistent")).toThrow(/not found/);
  });
});
