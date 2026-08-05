export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byProvider: ProviderUsage[];
}

export interface ProviderUsage {
  providerAccountId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  requestCount: number;
}

export interface UsageAccountOption {
  id: string;
  label: string;
}

export interface UsageRecord {
  id: string;
  timestamp: string;
  providerAccountId: string;
  comboId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "error";
  latencyMs: number;
  estimatedCost: number;
  requestBody?: string | null;
  responseBody?: string | null;
}

export interface HistoryFilters {
  providerAccountId: string;
  model: string;
  from: string;
  to: string;
}
