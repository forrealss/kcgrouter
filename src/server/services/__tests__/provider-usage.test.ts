import { afterEach, describe, expect, test } from "bun:test";

import {
  fetchQoderUsage,
  parseQoderPlan,
  parseQoderUsageResponse,
} from "../provider-usage.service";

describe("parseQoderUsageResponse", () => {
  test("maps userQuota into a credit row with used/total", () => {
    const quotas = parseQoderUsageResponse({
      userQuota: { used: 120, total: 500, remaining: 380, unit: "credits" },
      totalUsagePercentage: 24,
      isQuotaExceeded: false,
    });

    expect(quotas).toHaveLength(1);
    expect(quotas[0]).toMatchObject({
      name: "credit",
      used: 120,
      total: 500,
      resetAt: null,
    });
  });

  test("surfaces the expiresAt reset timestamp as ISO on every row", () => {
    const expiresAtMs = 1_800_000_000_000;
    const quotas = parseQoderUsageResponse({
      userQuota: { used: 10, total: 100 },
      orgResourcePackage: { used: 5, total: 50 },
      expiresAt: expiresAtMs,
    });

    expect(quotas).toHaveLength(2);
    for (const q of quotas) {
      expect(q.resetAt).toBe(new Date(expiresAtMs).toISOString());
    }
  });

  test("only adds the organization row when the payload carries org quota", () => {
    const withOrg = parseQoderUsageResponse({
      userQuota: { used: 1, total: 10 },
      orgResourcePackage: { used: 2, total: 20 },
    });
    expect(withOrg.map((q) => q.name)).toEqual(["credit", "Organization"]);

    const emptyOrg = parseQoderUsageResponse({
      userQuota: { used: 1, total: 10 },
      orgResourcePackage: {},
    });
    expect(emptyOrg).toHaveLength(1);
  });

  test("tolerates missing, malformed or data-empty payloads", () => {
    expect(parseQoderUsageResponse(null)).toEqual([]);
    expect(parseQoderUsageResponse("nope")).toEqual([]);
    // A structurally valid but data-empty payload must not produce a
    // misleading zeroed "habis" credit row.
    expect(parseQoderUsageResponse({})).toEqual([]);
    expect(
      parseQoderUsageResponse({ userQuota: { used: 0, total: 0 } }),
    ).toEqual([]);
  });

  test("coerces string numbers and ignores invalid values", () => {
    const quotas = parseQoderUsageResponse({
      userQuota: { used: "42", total: "100" },
      expiresAt: "not-a-number",
    });
    expect(quotas[0]).toMatchObject({ used: 42, total: 100, resetAt: null });
  });

  test("clamps used to total so the card cannot render negative percentages", () => {
    const quotas = parseQoderUsageResponse({
      userQuota: { used: 150, total: 100 },
      orgResourcePackage: { used: 999, total: 50 },
    });
    expect(quotas[0]).toMatchObject({ name: "credit", used: 100, total: 100 });
    expect(quotas[1]).toMatchObject({
      name: "Organization",
      used: 50,
      total: 50,
    });
  });
});

describe("parseQoderPlan", () => {
  test("prefers the userTag when present", () => {
    expect(
      parseQoderPlan({ plan: "PLAN_TIER_PRO", userTag: "Qoder Pro" }),
    ).toBe("Qoder Pro");
  });

  test("strips the PLAN_TIER_ prefix and title-cases the plan id", () => {
    expect(parseQoderPlan({ plan: "PLAN_TIER_PRO" })).toBe("Pro");
    expect(parseQoderPlan({ plan: "PLAN_TIER_FREE_TRIAL" })).toBe("Free Trial");
  });

  test("passes through a plan id without the prefix verbatim", () => {
    expect(parseQoderPlan({ plan: "enterprise" })).toBe("Enterprise");
  });

  test("returns undefined when no plan info exists", () => {
    expect(parseQoderPlan({})).toBeUndefined();
    expect(parseQoderPlan(null)).toBeUndefined();
    expect(parseQoderPlan("nope")).toBeUndefined();
    expect(parseQoderPlan({ plan: "PLAN_TIER_" })).toBeUndefined();
  });
});

describe("fetchQoderUsage", () => {
  let restoreFetch: (() => void) | null = null;

  function stubFetch(
    handler: (url: string, init: RequestInit) => Promise<Response>,
  ): void {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init ?? {})) as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };
  }

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function usageStub(overrides?: {
    quotaStatus?: number;
    statusStatus?: number;
    plan?: unknown;
  }) {
    const {
      quotaStatus = 200,
      statusStatus = 200,
      plan = "Qoder Pro",
    } = overrides ?? {};
    return async (url: string): Promise<Response> => {
      if (url.includes("/jobToken/exchange")) {
        return jsonResponse({ token: "jt-test", expires_in: 3600 });
      }
      if (url.includes("/userinfo")) {
        return jsonResponse({ id: "user-1" });
      }
      if (url.includes("/api/v2/quota/usage")) {
        return jsonResponse(
          { userQuota: { used: 10, total: 100 } },
          quotaStatus,
        );
      }
      if (url.includes("/api/v3/user/status")) {
        return jsonResponse(
          { plan: "PLAN_TIER_PRO", userTag: plan },
          statusStatus,
        );
      }
      return jsonResponse({}, 404);
    };
  }

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
  });

  test("returns quotas and the plan when both fetches succeed", async () => {
    stubFetch(usageStub());
    const result = await fetchQoderUsage("pt-plan-test");
    expect(result).not.toBeNull();
    expect(result?.plan).toBe("Qoder Pro");
    expect(result?.quotas[0]).toMatchObject({
      name: "credit",
      used: 10,
      total: 100,
    });
  });

  test("a failed status fetch still returns the quotas without a plan", async () => {
    stubFetch(usageStub({ statusStatus: 500 }));
    const result = await fetchQoderUsage("pt-statusfail");
    expect(result).not.toBeNull();
    expect(result?.plan).toBeUndefined();
    expect(result?.quotas[0]).toMatchObject({ used: 10, total: 100 });
  });

  test("a failed quota fetch returns null", async () => {
    stubFetch(usageStub({ quotaStatus: 401 }));
    const result = await fetchQoderUsage("pt-quotafail");
    expect(result).toBeNull();
  });
});
