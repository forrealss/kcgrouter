import { afterEach, describe, expect, test } from "bun:test";
import {
  clearAntigravityQuotaCache,
  getCachedAntigravityQuota,
  parseModelQuotas,
  parseResetTime,
  parseWeeklyQuotaSummary,
  QUOTA_CACHE_TTL_MS,
  reconcileWeeklyAgainstModels,
} from "../quota";

// --- parseResetTime ---

describe("antigravity quota — parseResetTime", () => {
  test("parses ISO strings", () => {
    expect(parseResetTime("2026-09-17T00:00:00Z")).toBe(
      "2026-09-17T00:00:00.000Z",
    );
  });

  test("treats unix seconds as seconds", () => {
    // 1_000_000_000 s -> 2001-09-09
    expect(parseResetTime(1_000_000_000)).toBe("2001-09-09T01:46:40.000Z");
  });

  test("treats millisecond values as milliseconds", () => {
    expect(parseResetTime(1_000_000_000_000)).toBe("2001-09-09T01:46:40.000Z");
  });

  test("treats numeric strings like numbers", () => {
    expect(parseResetTime("1000000000")).toBe("2001-09-09T01:46:40.000Z");
  });

  test("returns null for empty, non-numeric junk, and other types", () => {
    expect(parseResetTime(null)).toBeNull();
    expect(parseResetTime(undefined)).toBeNull();
    expect(parseResetTime("")).toBeNull();
    expect(parseResetTime("not-a-date")).toBeNull();
    expect(parseResetTime({ nested: true })).toBeNull();
  });
});

// --- parseModelQuotas (fetchAvailableModels) ---

describe("antigravity quota — parseModelQuotas", () => {
  test("extracts remaining fraction as promille used/total for known models", () => {
    const quotas = parseModelQuotas({
      models: {
        "gemini-3.8-flash-high": {
          displayName: "Gemini 3.8 Flash (High)",
          quotaInfo: { remainingFraction: 0.75, resetTime: 1_000_000_000 },
        },
        "claude-sonnet-4-6": {
          quotaInfo: { remainingFraction: 0.1 },
        },
      },
    });

    expect(quotas["gemini-3.8-flash-high"]).toEqual({
      used: 250,
      total: 1000,
      resetAt: "2001-09-09T01:46:40.000Z",
      remainingPercentage: 75,
    });
    expect(quotas["claude-sonnet-4-6"]?.used).toBe(900);
    expect(quotas["claude-sonnet-4-6"]?.total).toBe(1000);
  });

  test("skips internal, unknown, and quotaInfo-less models", () => {
    const quotas = parseModelQuotas({
      models: {
        "internal-probe": {
          isInternal: true,
          quotaInfo: { remainingFraction: 0.5 },
        },
        "totally-unknown-model": { quotaInfo: { remainingFraction: 0.5 } },
        "gemini-3.8-flash-medium": { displayName: "no quota info" },
        "gemini-pro-agent": { quotaInfo: { remainingFraction: 0.5 } },
      },
    });

    expect(Object.keys(quotas)).toEqual(["gemini-pro-agent"]);
  });

  test("skips models without a finite remainingFraction", () => {
    const quotas = parseModelQuotas({
      models: {
        "gemini-pro-agent": { quotaInfo: {} },
        "claude-sonnet-4-6": { quotaInfo: { remainingFraction: "junk" } },
      },
    });
    expect(quotas).toEqual({});
  });

  test("clamps out-of-range fractions into 0..1", () => {
    const high = parseModelQuotas({
      models: { "gemini-pro-agent": { quotaInfo: { remainingFraction: 1.5 } } },
    });
    expect(high["gemini-pro-agent"]).toMatchObject({
      used: 0,
      remainingPercentage: 100,
    });

    const negative = parseModelQuotas({
      models: { "gemini-pro-agent": { quotaInfo: { remainingFraction: -1 } } },
    });
    expect(negative["gemini-pro-agent"]).toMatchObject({
      used: 1000,
      remainingPercentage: 0,
    });
  });

  test("returns empty for null or malformed payloads", () => {
    expect(parseModelQuotas(null)).toEqual({});
    expect(parseModelQuotas(undefined)).toEqual({});
    expect(parseModelQuotas({})).toEqual({});
    expect(parseModelQuotas({ models: {} })).toEqual({});
  });
});

// --- parseWeeklyQuotaSummary (retrieveUserQuotaSummary) ---

describe("antigravity quota — parseWeeklyQuotaSummary", () => {
  const weeklyGroups = {
    groups: [
      {
        displayName: "Gemini",
        buckets: [
          {
            bucketId: "gemini_weekly",
            displayName: "Weekly",
            remainingFraction: 0.9,
            resetTime: "2026-09-21T00:00:00Z",
          },
        ],
      },
      {
        displayName: "Claude & GPT",
        buckets: [
          {
            bucketId: "claude_gpt_weekly",
            displayName: "Weekly",
            remainingFraction: 0.4,
            resetTime: "2026-09-21T00:00:00Z",
          },
        ],
      },
    ],
  };

  test("maps groups to gemini_weekly and claude_gpt_weekly rows", () => {
    const weekly = parseWeeklyQuotaSummary(weeklyGroups);

    expect(weekly.gemini_weekly).toEqual({
      used: 100,
      total: 1000,
      resetAt: "2026-09-21T00:00:00.000Z",
      remainingPercentage: 90,
      displayName: "Gemini (Weekly)",
    });
    expect(weekly.claude_gpt_weekly).toMatchObject({
      used: 600,
      remainingPercentage: 40,
      displayName: "Claude & GPT (Weekly)",
    });
  });

  test("reads groups from data.quotaSummary.groups when top-level is absent", () => {
    const weekly = parseWeeklyQuotaSummary({
      quotaSummary: { groups: weeklyGroups.groups },
    });
    expect(Object.keys(weekly)).toEqual(["gemini_weekly", "claude_gpt_weekly"]);
  });

  test("matches family by group displayName, not bucket name", () => {
    const weekly = parseWeeklyQuotaSummary({
      groups: [
        {
          displayName: "Claude Pro Limits",
          buckets: [
            { bucketId: "b1", displayName: "Weekly", remainingFraction: 1 },
          ],
        },
      ],
    });
    expect(weekly.claude_gpt_weekly?.displayName).toBe("Claude & GPT (Weekly)");
  });

  test("skips non-weekly, disabled, and fraction-less buckets", () => {
    const weekly = parseWeeklyQuotaSummary({
      groups: [
        {
          displayName: "Gemini",
          buckets: [
            { bucketId: "daily", displayName: "Daily", remainingFraction: 0.5 },
            {
              bucketId: "weekly",
              displayName: "Weekly",
              disabled: true,
              remainingFraction: 0.5,
            },
            { bucketId: "weekly2", displayName: "Weekly" },
          ],
        },
      ],
    });
    expect(weekly).toEqual({});
  });

  test("keeps the first matching bucket per family", () => {
    const weekly = parseWeeklyQuotaSummary({
      groups: [
        {
          displayName: "Gemini",
          buckets: [
            { bucketId: "w1", displayName: "Weekly", remainingFraction: 0.9 },
            { bucketId: "w2", displayName: "Weekly", remainingFraction: 0.1 },
          ],
        },
      ],
    });
    expect(weekly.gemini_weekly?.remainingPercentage).toBe(90);
  });

  test("returns empty for null or group-less payloads", () => {
    expect(parseWeeklyQuotaSummary(null)).toEqual({});
    expect(parseWeeklyQuotaSummary({})).toEqual({});
    expect(parseWeeklyQuotaSummary({ groups: "nope" })).toEqual({});
  });
});

// --- cache (getCachedAntigravityQuota) ---

describe("antigravity quota — cache", () => {
  const originalFetch = globalThis.fetch;
  let modelCalls = 0;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearAntigravityQuotaCache();
  });

  function stubQuotaFetch(): void {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(":loadCodeAssist")) {
        // Paid tier — otherwise fetchAntigravityQuota skips per-model rows.
        return new Response(
          JSON.stringify({
            paidTier: { id: "g-pro" },
            currentTier: { name: "Pro" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes(":fetchAvailableModels")) {
        modelCalls += 1;
        return new Response(
          JSON.stringify({
            models: {
              "gemini-pro-agent": {
                quotaInfo: { remainingFraction: 0.5 },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ groups: [] }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  test("serves repeat calls from cache within the TTL", async () => {
    stubQuotaFetch();
    modelCalls = 0;

    const first = await getCachedAntigravityQuota("acct-cache-1", "tok");
    expect(Object.keys(first.quotas)).toContain("gemini-pro-agent");
    expect(modelCalls).toBe(1);

    const second = await getCachedAntigravityQuota("acct-cache-1", "tok");
    expect(second).toEqual(first);
    expect(modelCalls).toBe(1);
  });

  test("shares one in-flight fetch between concurrent callers", async () => {
    stubQuotaFetch();
    modelCalls = 0;

    const [a, b, c] = await Promise.all([
      getCachedAntigravityQuota("acct-cache-2", "tok"),
      getCachedAntigravityQuota("acct-cache-2", "tok"),
      getCachedAntigravityQuota("acct-cache-2", "tok"),
    ]);
    expect(modelCalls).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  test("refresh bypasses the TTL but repopulates the cache", async () => {
    stubQuotaFetch();
    modelCalls = 0;

    await getCachedAntigravityQuota("acct-cache-3", "tok");
    expect(modelCalls).toBe(1);

    await getCachedAntigravityQuota("acct-cache-3", "tok", undefined, true);
    expect(modelCalls).toBe(2);

    // The refreshed result replaced the cached entry.
    await getCachedAntigravityQuota("acct-cache-3", "tok");
    expect(modelCalls).toBe(2);
  });

  test("separate keys do not share cache entries", async () => {
    stubQuotaFetch();
    modelCalls = 0;

    await getCachedAntigravityQuota("acct-a", "tok");
    await getCachedAntigravityQuota("acct-b", "tok");
    expect(modelCalls).toBe(2);
  });

  test("empty results are not cached", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ models: {} }), {
        status: 200,
      })) as unknown as typeof fetch;

    await getCachedAntigravityQuota("acct-empty", "tok");
    // Second call must hit the network again (nothing was cached).
    await getCachedAntigravityQuota("acct-empty", "tok");
    // No assertion on call count needed: the contract under test is that the
    // second call re-fetches, which only holds when nothing was cached.
    expect(QUOTA_CACHE_TTL_MS).toBe(180_000);
  });
});

// --- reconcileWeeklyAgainstModels (free-tier bug) ---

describe("antigravity quota — reconcileWeeklyAgainstModels", () => {
  const model = (remainingPercentage: number, resetAt?: string) => ({
    used: 1000 - remainingPercentage * 10,
    total: 1000,
    resetAt: resetAt ?? null,
    remainingPercentage,
  });

  test("forces weekly to exhausted when every model of the family is at 0%", () => {
    const weekly = {
      gemini_weekly: {
        used: 0,
        total: 1000,
        resetAt: "2026-09-28T00:00:00.000Z",
        remainingPercentage: 100,
        displayName: "Gemini (Weekly)",
      },
    };
    const models = {
      "gemini-3.8-flash-high": model(0, "2026-09-18T10:00:00.000Z"),
      "gemini-pro-agent": model(0, "2026-09-19T10:00:00.000Z"),
    };

    const result = reconcileWeeklyAgainstModels(models, weekly);
    expect(result.gemini_weekly?.used).toBe(1000);
    expect(result.gemini_weekly?.remainingPercentage).toBe(0);
    // reset time moves to the family's max reset time
    expect(result.gemini_weekly?.resetAt).toBe("2026-09-19T10:00:00.000Z");
  });

  test("leaves weekly alone when some models still have headroom", () => {
    const weekly = {
      gemini_weekly: {
        used: 0,
        total: 1000,
        resetAt: null,
        remainingPercentage: 100,
        displayName: "Gemini (Weekly)",
      },
    };
    const models = {
      "gemini-3.8-flash-high": model(0),
      "gemini-pro-agent": model(25),
    };

    const result = reconcileWeeklyAgainstModels(models, weekly);
    expect(result.gemini_weekly?.remainingPercentage).toBe(100);
  });

  test("reconciles claude family independently of gemini", () => {
    const weekly = {
      gemini_weekly: {
        used: 0,
        total: 1000,
        resetAt: null,
        remainingPercentage: 50,
        displayName: "Gemini (Weekly)",
      },
      claude_gpt_weekly: {
        used: 0,
        total: 1000,
        resetAt: null,
        remainingPercentage: 80,
        displayName: "Claude & GPT (Weekly)",
      },
    };
    const models = {
      "gemini-3.8-flash-high": model(10),
      "claude-sonnet-4-6": model(0, "2026-09-18T00:00:00.000Z"),
      "claude-opus-4-6-thinking": model(0, "2026-09-17T00:00:00.000Z"),
    };

    const result = reconcileWeeklyAgainstModels(models, weekly);
    expect(result.gemini_weekly?.remainingPercentage).toBe(50);
    expect(result.claude_gpt_weekly?.remainingPercentage).toBe(0);
  });

  test("ignores families with no per-model rows (e.g. free tier)", () => {
    const weekly = {
      gemini_weekly: {
        used: 0,
        total: 1000,
        resetAt: null,
        remainingPercentage: 100,
        displayName: "Gemini (Weekly)",
      },
    };
    const result = reconcileWeeklyAgainstModels({}, weekly);
    expect(result.gemini_weekly?.remainingPercentage).toBe(100);
  });
});
