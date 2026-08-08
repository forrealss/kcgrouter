import { get, query } from "../../db/client";
import type { ProviderTransport } from "../../db/schema";
import {
  QODER_QUOTA_USAGE_URL,
  QODER_USER_STATUS_URL,
} from "../providers/qoder/constants";
import { resolveQoderCredentials } from "../providers/qoder/model-catalog";
import { decrypt } from "./crypto.service";

export interface ProviderQuota {
  name: string;
  used: number;
  total: number;
  resetAt: string | null;
}

export interface ProviderUsageResult {
  provider: ProviderTransport;
  accountId: string;
  label: string;
  plan?: string;
  quotas: ProviderQuota[];
  message?: string;
}

function parseResetTime(resetDate: string | null | undefined): string | null {
  if (!resetDate) return null;
  try {
    const date = new Date(resetDate);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

async function fetchKiroUsage(
  apiKey: string,
): Promise<ProviderUsageResult | null> {
  const params = new URLSearchParams({
    isEmailRequired: "true",
    origin: "AI_EDITOR",
    resourceType: "AGENTIC_REQUEST",
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "x-amz-user-agent": "aws-sdk-js/1.0.0 KiroIDE",
    "user-agent": "aws-sdk-js/1.0.0 KiroIDE",
    tokentype: "API_KEY",
  };

  const endpoints = [
    `https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits?${params}`,
    `https://q.us-east-1.amazonaws.com/getUsageLimits?${params}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        usageBreakdownList?: Array<{
          resourceType?: string;
          currentUsageWithPrecision?: number;
          usageLimitWithPrecision?: number;
          nextDateReset?: string;
          resetDate?: string;
          freeTrialInfo?: {
            currentUsageWithPrecision?: number;
            usageLimitWithPrecision?: number;
            freeTrialExpiry?: string;
          };
        }>;
        subscriptionInfo?: { subscriptionTitle?: string };
        nextDateReset?: string;
        resetDate?: string;
      };

      const resetAt = parseResetTime(data.nextDateReset || data.resetDate);
      const quotas: ProviderQuota[] = [];

      for (const item of data.usageBreakdownList || []) {
        const name = item.resourceType?.toLowerCase() || "unknown";
        quotas.push({
          name,
          used: item.currentUsageWithPrecision || 0,
          total: item.usageLimitWithPrecision || 0,
          resetAt: resetAt,
        });

        if (item.freeTrialInfo) {
          quotas.push({
            name: `${name} (free trial)`,
            used: item.freeTrialInfo.currentUsageWithPrecision || 0,
            total: item.freeTrialInfo.usageLimitWithPrecision || 0,
            resetAt:
              parseResetTime(item.freeTrialInfo.freeTrialExpiry) || resetAt,
          });
        }
      }

      return {
        provider: "kiro",
        accountId: "",
        label: "",
        plan: data.subscriptionInfo?.subscriptionTitle || "Kiro",
        quotas,
      };
    } catch {}
  }

  return null;
}

function epochMsToIso(ms: number): string | null {
  if (!ms || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchCommandCodeUsage(
  apiKey: string,
): Promise<ProviderUsageResult | null> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const [creditsRes, subsRes] = await Promise.all([
    fetch("https://api.commandcode.ai/alpha/billing/credits", {
      method: "GET",
      headers,
    }),
    fetch("https://api.commandcode.ai/alpha/billing/subscriptions", {
      method: "GET",
      headers,
    }),
  ]);

  if (!creditsRes.ok) return null;

  const data = (await creditsRes.json()) as {
    credits?: {
      monthlyCredits?: number;
      purchasedCredits?: number;
      freeCredits?: number;
    };
    windowLimits?: {
      fiveHour?: {
        used?: number;
        cap?: number;
        resetAt?: number;
      };
      weekly?: {
        used?: number;
        cap?: number;
        resetAt?: number;
      };
    };
  };

  let plan: string | undefined;
  if (subsRes.ok) {
    const subsData = (await subsRes.json()) as {
      data?: { planId?: string };
    };
    plan = subsData.data?.planId;
  }

  const quotas: ProviderQuota[] = [];

  if (data.windowLimits?.fiveHour) {
    const wh = data.windowLimits.fiveHour;
    quotas.push({
      name: "5-hour",
      used: wh.used || 0,
      total: wh.cap || 0,
      resetAt: epochMsToIso(wh.resetAt ?? 0),
    });
  }

  if (data.windowLimits?.weekly) {
    const w = data.windowLimits.weekly;
    quotas.push({
      name: "weekly",
      used: w.used || 0,
      total: w.cap || 0,
      resetAt: epochMsToIso(w.resetAt ?? 0),
    });
  }

  if (data.credits) {
    const c = data.credits;
    const total =
      (c.monthlyCredits || 0) +
      (c.purchasedCredits || 0) +
      (c.freeCredits || 0);
    quotas.push({
      name: "credit",
      used: total - (c.monthlyCredits || 0),
      total,
      resetAt: null,
    });
  }

  return {
    provider: "command-code",
    accountId: "",
    label: "",
    plan,
    quotas,
  };
}

// --- Qoder usage ---

/**
 * Map a Qoder /api/v2/quota/usage payload into kcgrouter ProviderQuota rows.
 * Pure (no I/O) so it can be unit-tested against captured payloads.
 *
 * Payload shape (see 9router getQoderUsage):
 *   { userQuota: { used, total, remaining, unit }, orgResourcePackage: {...},
 *     totalUsagePercentage, isQuotaExceeded, expiresAt }
 * `expiresAt` is a single absolute reset timestamp (ms) applied to every row.
 */
export function parseQoderUsageResponse(body: unknown): ProviderQuota[] {
  if (!body || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;

  const userQuota =
    rec.userQuota && typeof rec.userQuota === "object"
      ? (rec.userQuota as Record<string, unknown>)
      : {};
  const orgQuota =
    rec.orgResourcePackage && typeof rec.orgResourcePackage === "object"
      ? (rec.orgResourcePackage as Record<string, unknown>)
      : {};

  const expiresAtMs =
    Number.isFinite(Number(rec.expiresAt)) && Number(rec.expiresAt) > 0
      ? Number(rec.expiresAt)
      : null;
  const resetAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;

  const userUsed = Number(userQuota.used) || 0;
  const userTotal = Number(userQuota.total) || 0;
  const orgUsed = Number(orgQuota.used) || 0;
  const orgTotal = Number(orgQuota.total) || 0;

  // The quota card derives remaining as `total - used`, so clamp `used` to
  // `total` to keep percentages from going negative on reporting skew.
  const clampUsed = (used: number, total: number): number =>
    total > 0 ? Math.min(used, total) : used;

  const quotas: ProviderQuota[] = [];

  // Only surface rows when the payload actually carries data — a zeroed 0/0
  // credit row would render as "habis" (exhausted) on the quota card.
  if (userTotal > 0 || userUsed > 0) {
    quotas.push({
      // Named "credit" so the quota card renders remaining/total (like
      // Command Code's monthly credits) instead of a percentage bar.
      name: "credit",
      used: clampUsed(userUsed, userTotal),
      total: userTotal,
      resetAt,
    });
  }

  // A plain PAT account has no org package, so skip the row when absent.
  if (orgTotal > 0 || orgUsed > 0) {
    quotas.push({
      name: "Organization",
      used: clampUsed(orgUsed, orgTotal),
      total: orgTotal,
      resetAt,
    });
  }

  return quotas;
}

/**
 * Map a Qoder /api/v3/user/status payload into a human-readable plan label.
 * Pure (no I/O) so it can be unit-tested. Prefers the userTag, then the plan
 * id with its `PLAN_TIER_` prefix stripped and title-cased.
 */
export function parseQoderPlan(status: unknown): string | undefined {
  if (!status || typeof status !== "object") return undefined;
  const rec = status as Record<string, unknown>;

  const tag = String(rec.userTag ?? "").trim();
  if (tag) return tag;

  const raw = String(rec.plan ?? "").trim();
  if (!raw) return undefined;
  const stripped = raw.replace(/^PLAN_TIER_/i, "");
  if (!stripped) return undefined;
  return stripped
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** GET a Qoder endpoint with the job token, returning null on any failure. */
async function qoderFetch(
  url: string,
  jobToken: string,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jobToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Exported for unit tests; wired into usageFetchers below.
export async function fetchQoderUsage(
  apiKey: string,
): Promise<ProviderUsageResult | null> {
  // The quota endpoints only accept short-lived job tokens (jt-...), so PAT
  // (pt-...) connections must be exchanged first — same path as chat.
  let jobToken: string;
  try {
    const resolved = await resolveQoderCredentials(apiKey);
    jobToken = resolved.accessToken;
  } catch {
    return null;
  }
  if (!jobToken) return null;

  // Fire both fetches in parallel. The quota payload is required; the plan
  // label is cosmetic, so a failed status fetch must not hide the rows.
  const [quotaSettled, statusSettled] = await Promise.allSettled([
    (async () => {
      const res = await qoderFetch(QODER_QUOTA_USAGE_URL, jobToken);
      if (!res?.ok) return null;
      return res.json().catch(() => null);
    })(),
    (async () => {
      const res = await qoderFetch(QODER_USER_STATUS_URL, jobToken);
      if (!res?.ok) return undefined;
      const statusBody = await res.json().catch(() => null);
      return parseQoderPlan(statusBody);
    })(),
  ]);

  const body = quotaSettled.status === "fulfilled" ? quotaSettled.value : null;
  const quotas = parseQoderUsageResponse(body);
  if (quotas.length === 0) return null;

  const plan =
    statusSettled.status === "fulfilled" ? statusSettled.value : undefined;

  return {
    provider: "qoder",
    accountId: "",
    label: "",
    plan,
    quotas,
  };
}

const usageFetchers: Partial<
  Record<
    ProviderTransport,
    (apiKey: string) => Promise<ProviderUsageResult | null>
  >
> = {
  kiro: fetchKiroUsage,
  "command-code": fetchCommandCodeUsage,
  qoder: fetchQoderUsage,
};

/**
 * Whether a provider transport has a usage tracker (i.e. a fetcher above).
 * Used to decide which connections appear on the Quota page.
 */
export function isTrackedTransport(transport: ProviderTransport): boolean {
  return usageFetchers[transport] != null;
}

export async function getProviderUsage(
  accountId: string,
): Promise<ProviderUsageResult | null> {
  const row = get<{
    provider_id: string;
    credential_enc: string;
    label: string;
  }>(
    `SELECT pa.provider_id, pa.credential_enc, pa.label
     FROM provider_accounts pa
     WHERE pa.id = ?`,
    accountId,
  );
  if (!row) return null;

  const providerRow = get<{ transport: ProviderTransport }>(
    "SELECT transport FROM providers WHERE id = ?",
    row.provider_id,
  );
  if (!providerRow) return null;

  const fetcher = usageFetchers[providerRow.transport];
  if (!fetcher) return null;

  const apiKey = decrypt(row.credential_enc);
  const result = await fetcher(apiKey);
  if (result) {
    result.accountId = accountId;
    result.label = row.label;
  }
  return result;
}

export async function getAllProviderUsage(): Promise<ProviderUsageResult[]> {
  const accounts = query<{
    id: string;
    provider_id: string;
    transport: ProviderTransport;
    label: string;
    credential_enc: string;
  }>(
    `SELECT pa.id, pa.provider_id, p.transport, pa.label, pa.credential_enc
     FROM provider_accounts pa
     JOIN providers p ON p.id = pa.provider_id
     WHERE pa.status = 'active'`,
  );

  const results: ProviderUsageResult[] = [];

  for (const account of accounts) {
    const fetcher = usageFetchers[account.transport];
    if (!fetcher) continue;

    try {
      const apiKey = decrypt(account.credential_enc);
      const result = await fetcher(apiKey);
      if (result) {
        result.accountId = account.id;
        result.label = account.label;
        results.push(result);
      }
    } catch {
      // skip failed accounts
    }
  }

  return results;
}
