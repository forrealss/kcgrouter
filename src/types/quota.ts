import type { ProviderTransport } from "./provider";

export interface QuotaAccount {
  id: string;
  providerId: string;
  label: string;
  status: "active" | "error" | "expired";
  quotaLimitTokens: number | null;
  lastUsedAt: string | null;
  createdAt: string;
  providerName: string;
  transport: ProviderTransport;
  available: boolean;
  quotaState: {
    accountId: string;
    tokensUsed: number;
    requestCount: number;
  };
}

/**
 * Mirrors ProviderQuotaKind in src/server/services/provider-usage.service.ts.
 *
 * - `window`: real consumption cap — render progress against `total`.
 * - `balance`: amount on hand with no cap — render the value only, never a bar.
 */
export type ProviderQuotaKind = "window" | "balance";

export interface ProviderQuotaItem {
  name: string;
  used: number;
  total: number;
  resetAt: string | null;
  /** Older payloads may omit this; treat a missing kind as a window. */
  kind?: ProviderQuotaKind;
}

export interface ProviderUsageData {
  provider: string;
  accountId: string;
  label: string;
  plan?: string;
  quotas: ProviderQuotaItem[];
  message?: string;
}
