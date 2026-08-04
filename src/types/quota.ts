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
