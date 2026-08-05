import type { ProviderTransport } from "./provider";

export interface QuotaAccount {
  id: string;
  providerId: string;
  label: string;
  status: "active" | "error" | "expired";
  quotaResetType: "5h" | "daily" | "weekly" | "none";
  quotaLimitTokens: number | null;
  lastUsedAt: string | null;
  createdAt: string;
  providerName: string;
  transport: ProviderTransport;
  available: boolean;
  quotaState: {
    accountId: string;
    windowType: "5h" | "daily" | "weekly" | "none";
    windowStart: string;
    windowEnd: string | null;
    tokensUsed: number;
    requestCount: number;
  };
}

export interface ProviderQuotaItem {
  name: string;
  used: number;
  total: number;
  resetAt: string | null;
}

export interface ProviderUsageData {
  provider: string;
  accountId: string;
  label: string;
  plan?: string;
  quotas: ProviderQuotaItem[];
  message?: string;
}
