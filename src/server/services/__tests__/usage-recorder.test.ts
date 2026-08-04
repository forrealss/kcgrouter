import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { addAccount, createProvider } from "../provider-registry.service";
import { getHistory, record, summarize } from "../usage-recorder.service";

describe("UsageRecorder", () => {
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

  test("record inserts a usage record", () => {
    const p = createProvider({
      name: `UR-Test-${Date.now()}`,
      transport: "openai",
      baseUrl: "https://t.com",
      prefix: `ur-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const a = addAccount(p.id, { label: "A", apiKey: "sk" });

    record({
      providerAccountId: a.id,
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      status: "success",
      latencyMs: 200,
      estimatedCost: 0.01,
    });

    const history = getHistory({ limit: 1 });
    expect(history.length).toBe(1);
    expect(history[0]?.inputTokens).toBe(100);
    expect(history[0]?.model).toBe("gpt-4o");
  });

  test("Property 29: history limited to 50", () => {
    const p = createProvider({
      name: `UR-Limit-${Date.now()}`,
      transport: "openai",
      baseUrl: "https://t.com",
      prefix: `ur-limit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const a = addAccount(p.id, { label: "A", apiKey: "sk" });

    for (let i = 0; i < 60; i++) {
      record({
        providerAccountId: a.id,
        model: "m",
        inputTokens: 1,
        outputTokens: 0,
        status: "success",
        latencyMs: 1,
        estimatedCost: 0,
      });
    }

    const history = getHistory({ limit: 50 });
    expect(history.length).toBe(50);
  });

  test("Property 30: filter by model", () => {
    const p = createProvider({
      name: `UR-Filter-${Date.now()}`,
      transport: "openai",
      baseUrl: "https://t.com",
      prefix: `ur-filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const a = addAccount(p.id, { label: "A", apiKey: "sk" });

    record({
      providerAccountId: a.id,
      model: "target-model",
      inputTokens: 1,
      outputTokens: 0,
      status: "success",
      latencyMs: 1,
      estimatedCost: 0,
    });
    record({
      providerAccountId: a.id,
      model: "other-model",
      inputTokens: 1,
      outputTokens: 0,
      status: "success",
      latencyMs: 1,
      estimatedCost: 0,
    });

    const filtered = getHistory({ model: "target-model", limit: 100 });
    expect(filtered.every((r) => r.model === "target-model")).toBe(true);
  });

  test("summarize returns correct totals", () => {
    const p = createProvider({
      name: `UR-Sum-${Date.now()}`,
      transport: "openai",
      baseUrl: "https://t.com",
      prefix: `ur-sum-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    const a = addAccount(p.id, { label: "A", apiKey: "sk" });

    record({
      providerAccountId: a.id,
      model: "m",
      inputTokens: 100,
      outputTokens: 50,
      status: "success",
      latencyMs: 1,
      estimatedCost: 0.05,
    });
    record({
      providerAccountId: a.id,
      model: "m",
      inputTokens: 200,
      outputTokens: 100,
      status: "success",
      latencyMs: 1,
      estimatedCost: 0.1,
    });

    const summary = summarize();
    expect(summary.totalInputTokens).toBeGreaterThanOrEqual(300);
    expect(summary.totalOutputTokens).toBeGreaterThanOrEqual(150);
    expect(summary.byProvider.length).toBeGreaterThanOrEqual(1);
  });
});
