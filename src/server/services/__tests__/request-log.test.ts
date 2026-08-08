import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  addAccount,
  createProvider,
  deleteProvider,
  getAccount,
  recordAccountError,
  recordAccountSuccess,
} from "../provider-registry.service";
import {
  clearAll,
  count,
  getHistory,
  prune,
  record,
} from "../request-log.service";

describe("RequestLog", () => {
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
    clearAll();
  });

  afterAll(() => {
    clearAll();
  });

  test("record inserts entries and getHistory joins account/provider labels", () => {
    const p = createProvider({
      name: `RL-Test-${Date.now()}`,
      transport: "openai",
      baseUrl: "https://t.com",
      prefix: `rl-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const a = addAccount(p.id, { label: "Log Acct", apiKey: "sk" });

    record({
      type: "request",
      source: "router",
      providerAccountId: null,
      comboId: null,
      model: "gpt-4o",
      sourceFormat: "openai",
      stream: false,
      message: null,
      latencyMs: null,
    });
    record({
      type: "success",
      source: "router",
      providerAccountId: a.id,
      comboId: null,
      model: "gpt-4o",
      sourceFormat: "openai",
      stream: false,
      message: null,
      latencyMs: 120,
    });
    record({
      type: "error",
      source: "router",
      providerAccountId: a.id,
      comboId: null,
      model: "gpt-4o",
      sourceFormat: "openai",
      stream: false,
      message: "insufficient balance",
      latencyMs: 50,
    });

    const history = getHistory({ limit: 10 });
    expect(history.length).toBe(3);
    // Newest first: the error was inserted last
    expect(history[0]?.type).toBe("error");
    expect(history[0]?.message).toBe("insufficient balance");

    const success = history.find((r) => r.type === "success");
    expect(success?.accountLabel).toBe("Log Acct");
    expect(success?.providerName).toBe(p.name);

    const errors = getHistory({ type: "error", limit: 10 });
    expect(errors.length).toBe(1);
    expect(errors[0]?.providerAccountId).toBe(a.id);

    const requests = getHistory({ type: "request", limit: 10 });
    expect(requests.length).toBe(1);
    expect(requests[0]?.providerAccountId).toBeNull();

    deleteProvider(p.id);
  });

  test("recordAccountError sets status/lastError and success clears it", () => {
    const p = createProvider({
      name: `RL-Err-${Date.now()}`,
      transport: "openai",
      baseUrl: "https://t.com",
      prefix: `rl-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const a = addAccount(p.id, { label: "Err Acct", apiKey: "sk" });

    recordAccountError(a.id, "insufficient balance");
    const afterError = getAccount(a.id);
    expect(afterError?.status).toBe("error");
    expect(afterError?.lastError).toBe("insufficient balance");
    expect(afterError?.lastErrorAt).not.toBeNull();

    recordAccountSuccess(a.id);
    const afterSuccess = getAccount(a.id);
    expect(afterSuccess?.status).toBe("active");
    expect(afterSuccess?.lastError).toBeNull();
    expect(afterSuccess?.lastErrorAt).toBeNull();

    deleteProvider(p.id);
  });

  test("prune keeps only the newest rows", () => {
    clearAll();
    for (let i = 0; i < 10; i++) {
      record({
        type: "success",
        source: "router",
        providerAccountId: null,
        comboId: null,
        model: `m${i}`,
        sourceFormat: "openai",
        stream: false,
        message: null,
        latencyMs: i,
      });
    }
    expect(count()).toBe(10);

    prune(3);
    const history = getHistory({ limit: 100 });
    expect(history.length).toBe(3);
    // Newest three survive: models m7, m8, m9
    expect(history.map((r) => r.model).sort()).toEqual(["m7", "m8", "m9"]);
  });

  test("clearAll empties the log table", () => {
    record({
      type: "admin",
      source: "admin",
      providerAccountId: null,
      comboId: null,
      model: null,
      sourceFormat: null,
      stream: false,
      message: "test",
      latencyMs: null,
    });
    expect(count()).toBeGreaterThan(0);
    clearAll();
    expect(count()).toBe(0);
  });
});
