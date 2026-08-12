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

  // Get quota_limit_tokens + error cooldown from provider_accounts
  const row = get<{
    quota_limit_tokens: number | null;
    cooldown_until: string | null;
  }>(
    "SELECT quota_limit_tokens, cooldown_until FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!row) return false;

  // Account is cooling down after an upstream error — skip it.
  if (
    row.cooldown_until &&
    new Date(row.cooldown_until).getTime() > Date.now()
  ) {
    return false;
  }

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
