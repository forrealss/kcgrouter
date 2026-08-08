import { get, run } from "../../db/client";
import type { QuotaStateRow } from "../../db/schema";

export interface QuotaState {
  accountId: string;
  tokensUsed: number;
  requestCount: number;
}

function rowToState(row: QuotaStateRow): QuotaState {
  return {
    accountId: row.account_id,
    tokensUsed: row.tokens_used,
    requestCount: row.request_count,
  };
}

export function getState(accountId: string): QuotaState {
  const row = get<QuotaStateRow>(
    "SELECT * FROM quota_state WHERE account_id = ?",
    accountId,
  );
  if (!row) throw new Error(`Quota state not found for account ${accountId}`);
  return rowToState(row);
}

export function isAvailable(accountId: string): boolean {
  const state = getState(accountId);

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

export function markError(accountId: string, _errorKind: ErrorKind): void {
  run("UPDATE provider_accounts SET status = 'error' WHERE id = ?", accountId);
}
