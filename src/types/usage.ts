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
  /** In-place retries performed before this request completed (realtime only). */
  retries?: number;
  requestBody?: string | null;
  responseBody?: string | null;
}

/**
 * Sort keys accepted by `GET /api/usage/history`. Mirrors HISTORY_SORTS in
 * src/server/services/usage-recorder.service.ts — the server owns the ORDER BY.
 */
export type HistorySort =
  | "newest"
  | "oldest"
  | "slowest"
  | "fastest"
  | "costliest"
  | "most-tokens";

export interface HistoryFilters {
  providerAccountId: string;
  /** Exact model ID — the history query matches with `model = ?`, not LIKE. */
  model: string;
  /** Local calendar date, `YYYY-MM-DD`. Empty means unbounded. */
  from: string;
  /** Local calendar date, `YYYY-MM-DD`. Empty means unbounded. */
  to: string;
  /** Row cap sent to the API. Clamped to 1..500 server-side. */
  limit: number;
  sort: HistorySort;
}
