import { get, run } from "../../db/client";
import type { QuotaResetType, QuotaStateRow } from "../../db/schema";

export interface QuotaState {
  accountId: string;
  windowType: QuotaResetType;
  windowStart: string;
  windowEnd: string | null;
  tokensUsed: number;
  requestCount: number;
}

function rowToState(row: QuotaStateRow): QuotaState {
  return {
    accountId: row.account_id,
    windowType: row.window_type,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    tokensUsed: row.tokens_used,
    requestCount: row.request_count,
  };
}

function computeWindowEnd(type: QuotaResetType, start: Date): Date {
  switch (type) {
    case "5h":
      return new Date(start.getTime() + 5 * 60 * 60 * 1000);
    case "daily":
      return new Date(start.getTime() + 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`computeWindowEnd called with type=${type}`);
  }
}

export function getState(accountId: string): QuotaState {
  const row = get<QuotaStateRow>(
    "SELECT * FROM quota_state WHERE account_id = ?",
    accountId,
  );
  if (!row) throw new Error(`Quota state not found for account ${accountId}`);

  const now = new Date();

  if (
    row.window_type === "none" ||
    row.window_end === null ||
    now < new Date(row.window_end)
  ) {
    return rowToState(row);
  }

  const windowStart = now;
  const windowEnd = computeWindowEnd(row.window_type, windowStart);

  run(
    "UPDATE quota_state SET window_start = ?, window_end = ?, tokens_used = 0, request_count = 0 WHERE account_id = ?",
    windowStart.toISOString(),
    windowEnd.toISOString(),
    accountId,
  );

  return {
    accountId: row.account_id,
    windowType: row.window_type,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    tokensUsed: 0,
    requestCount: 0,
  };
}

export function isAvailable(accountId: string): boolean {
  const state = getState(accountId);

  if (state.windowType === "none") return true;

  // Get quota_limit_tokens from provider_accounts
  const row = get<{ quota_limit_tokens: number | null }>(
    "SELECT quota_limit_tokens FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!row) return false;

  if (row.quota_limit_tokens == null) return true;

  return state.tokensUsed < row.quota_limit_tokens;
}

export function recordUsage(accountId: string, tokens: number): void {
  run(
    "UPDATE quota_state SET tokens_used = tokens_used + ?, request_count = request_count + 1 WHERE account_id = ?",
    tokens,
    accountId,
  );
}

export type ErrorKind = "auth" | "rate_limit" | "server_error";

export function markError(accountId: string, errorKind: ErrorKind): void {
  const statusMap: Record<ErrorKind, string> = {
    auth: "error",
    rate_limit: "error",
    server_error: "error",
  };
  const status = statusMap[errorKind];

  run(
    "UPDATE provider_accounts SET status = ? WHERE id = ?",
    status,
    accountId,
  );
}
