import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { addAccount, createProvider } from "../provider-registry.service";
import {
  getHistory,
  HISTORY_SORT_KEYS,
  isHistorySort,
  record,
  summarize,
} from "../usage-recorder.service";

describe("UsageRecorder", () => {
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
      comboId: null,
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
        comboId: null,
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
      comboId: null,
      model: "target-model",
      inputTokens: 1,
      outputTokens: 0,
      status: "success",
      latencyMs: 1,
      estimatedCost: 0,
    });
    record({
      providerAccountId: a.id,
      comboId: null,
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
      comboId: null,
      model: "m",
      inputTokens: 100,
      outputTokens: 50,
      status: "success",
      latencyMs: 1,
      estimatedCost: 0.05,
    });
    record({
      providerAccountId: a.id,
      comboId: null,
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

  describe("history sorting", () => {
    /** Distinct latency/cost/token values so every ordering is unambiguous. */
    const shapes = [
      {
        model: "sort-a",
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 900,
        estimatedCost: 0.001,
      },
      {
        model: "sort-b",
        inputTokens: 900,
        outputTokens: 800,
        latencyMs: 50,
        estimatedCost: 0.5,
      },
      {
        model: "sort-c",
        inputTokens: 400,
        outputTokens: 100,
        latencyMs: 300,
        estimatedCost: 0.05,
      },
    ];
    let accountId = "";

    beforeAll(() => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const provider = createProvider({
        name: `UR-Sort-${unique}`,
        transport: "openai",
        baseUrl: "https://t.com",
        prefix: `ur-sort-${unique}`,
      });
      accountId = addAccount(provider.id, { label: "A", apiKey: "sk" }).id;
      for (const shape of shapes) {
        record({
          providerAccountId: accountId,
          comboId: null,
          status: "success",
          ...shape,
        });
      }
    });

    function models(sort: Parameters<typeof getHistory>[0]["sort"]) {
      return getHistory({ providerAccountId: accountId, sort }).map(
        (r) => r.model,
      );
    }

    test("orders by latency in both directions", () => {
      expect(models("slowest")).toEqual(["sort-a", "sort-c", "sort-b"]);
      expect(models("fastest")).toEqual(["sort-b", "sort-c", "sort-a"]);
    });

    test("orders by cost and by total tokens", () => {
      expect(models("costliest")).toEqual(["sort-b", "sort-c", "sort-a"]);
      expect(models("most-tokens")).toEqual(["sort-b", "sort-c", "sort-a"]);
    });

    test("oldest is the reverse of newest", () => {
      expect(models("oldest")).toEqual([...models("newest")].reverse());
    });

    test("defaults to newest when sort is omitted", () => {
      expect(models(undefined)).toEqual(models("newest"));
    });

    test("respects limit while sorted", () => {
      expect(
        getHistory({ providerAccountId: accountId, sort: "slowest", limit: 2 }),
      ).toHaveLength(2);
    });

    test("isHistorySort gates the ORDER BY allowlist", () => {
      for (const key of HISTORY_SORT_KEYS)
        expect(isHistorySort(key)).toBe(true);
      for (const bad of [
        "timestamp",
        "latency_ms",
        "id; DROP TABLE usage_records",
        "newest ASC",
        "__proto__",
        "",
      ]) {
        expect(isHistorySort(bad)).toBe(false);
      }
    });
  });
});
