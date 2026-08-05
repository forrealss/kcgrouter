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

const usageFetchers: Partial<
  Record<
    ProviderTransport,
    (apiKey: string) => Promise<ProviderUsageResult | null>
  >
> = {
  kiro: fetchKiroUsage,
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
