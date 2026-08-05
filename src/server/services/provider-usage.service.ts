import { get, query } from "../../db/client";
import type { ProviderTransport } from "../../db/schema";
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

const usageFetchers: Partial<
  Record<
    ProviderTransport,
    (apiKey: string) => Promise<ProviderUsageResult | null>
  >
> = {
  kiro: fetchKiroUsage,
  "command-code": fetchCommandCodeUsage,
};

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
