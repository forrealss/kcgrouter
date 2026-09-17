/**
 * Account-level OAuth maintenance for antigravity accounts.
 *
 * `credential_enc` stores the live Google access token (what adapters use as
 * `apiKey`); `oauth_enc` stores an encrypted JSON blob with the long-lived
 * refresh token, email, and projectId. Before a request goes out the router
 * calls `ensureFreshAccessToken`, which transparently POSTs to Google's token
 * endpoint when the stored access token is at (or past) the end of its life —
 * no browser involved.
 *
 * Concurrency: concurrent requests racing on the same expiring account all
 * share one in-flight refresh promise, and a just-refreshed token is reused
 * within a small clock-skew window instead of refreshing again.
 */

import { get, run } from "../../db/client";
import { refreshAccessToken } from "../providers/antigravity/oauth";
import { decrypt, encrypt } from "./crypto.service";
import * as EventBus from "./event-bus";

export interface AntigravityOAuthBlob {
  refreshToken: string;
  email?: string;
  projectId?: string;
}

/** Refresh when the token has this much lifetime left (9router: 300s). */
const REFRESH_LEAD_MS = 300_000;
/** A token freshly written by another request within this window is reused. */
const CLOCK_SKEW_MS = 5_000;

const inflightRefreshes = new Map<string, Promise<void>>();

interface OAuthAccountRow {
  id: string;
  credential_enc: string;
  oauth_enc: string | null;
  oauth_expires_at: string | null;
}

export function parseOAuthBlob(
  encrypted: string | null,
): AntigravityOAuthBlob | null {
  if (!encrypted) return null;
  try {
    const raw = decrypt(encrypted);
    const parsed = JSON.parse(raw) as Partial<AntigravityOAuthBlob>;
    if (!parsed.refreshToken) return null;
    return {
      refreshToken: parsed.refreshToken,
      email: parsed.email,
      projectId: parsed.projectId,
    };
  } catch {
    return null;
  }
}

export function serializeOAuthBlob(blob: AntigravityOAuthBlob): string {
  return encrypt(JSON.stringify(blob));
}

function shouldRefresh(row: OAuthAccountRow): boolean {
  if (!row.oauth_expires_at) return false;
  const expiresAt = new Date(row.oauth_expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() >= expiresAt - REFRESH_LEAD_MS;
}

/**
 * Persist new tokens for an OAuth account: access token into credential_enc
 * (+ oauth_expires_at), refresh token/email/projectId into oauth_enc.
 */
export function storeOAuthTokens(
  accountId: string,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  extra?: { email?: string; projectId?: string },
): void {
  const existing = parseOAuthBlob(
    get<{ oauth_enc: string | null }>(
      "SELECT oauth_enc FROM provider_accounts WHERE id = ?",
      accountId,
    )?.oauth_enc ?? null,
  );

  const blob: AntigravityOAuthBlob = {
    refreshToken: tokens.refreshToken || existing?.refreshToken || "",
    email: extra?.email ?? existing?.email,
    projectId: extra?.projectId ?? existing?.projectId,
  };
  if (!blob.refreshToken)
    throw new Error("Cannot store OAuth account without a refresh token");

  const expiresAt = new Date(
    Date.now() + tokens.expiresIn * 1000,
  ).toISOString();

  run(
    `UPDATE provider_accounts
     SET credential_enc = ?, oauth_enc = ?, oauth_expires_at = ?, status = 'active',
         last_error = NULL, last_error_at = NULL, cooldown_until = NULL, backoff_level = 0
     WHERE id = ?`,
    encrypt(tokens.accessToken),
    serializeOAuthBlob(blob),
    expiresAt,
    accountId,
  );

  EventBus.publish("account:recovered", { accountId });
}

/**
 * Refresh the access token if needed, deduplicating concurrent callers.
 * Returns the (possibly updated) decrypted credential, or null when the
 * account has no OAuth data and no refresh is possible.
 */
export async function ensureFreshAccessToken(
  accountId: string,
): Promise<{ apiKey: string; projectId?: string; email?: string } | null> {
  const row = get<OAuthAccountRow>(
    "SELECT id, credential_enc, oauth_enc, oauth_expires_at FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!row) return null;

  const blob = parseOAuthBlob(row.oauth_enc);
  if (!blob) {
    // Not an OAuth account (or unrecoverable blob) — use the stored credential.
    return { apiKey: decrypt(row.credential_enc) };
  }

  const projectId = blob.projectId;

  if (!shouldRefresh(row)) {
    // Fresh enough — but if another request refreshed it seconds ago, prefer
    // the newer row so we don't stampede on the exact expiry boundary.
    if (inflightRefreshes.has(accountId)) {
      await inflightRefreshes.get(accountId);
      const updated = get<OAuthAccountRow>(
        "SELECT id, credential_enc, oauth_enc, oauth_expires_at FROM provider_accounts WHERE id = ?",
        accountId,
      );
      if (updated) {
        return {
          apiKey: decrypt(updated.credential_enc),
          projectId: parseOAuthBlob(updated.oauth_enc)?.projectId,
        };
      }
    }
    return { apiKey: decrypt(row.credential_enc), projectId };
  }

  const inflight = inflightRefreshes.get(accountId);
  if (inflight) {
    await inflight;
    const updated = get<OAuthAccountRow>(
      "SELECT id, credential_enc, oauth_enc, oauth_expires_at FROM provider_accounts WHERE id = ?",
      accountId,
    );
    if (updated) {
      return {
        apiKey: decrypt(updated.credential_enc),
        projectId: parseOAuthBlob(updated.oauth_enc)?.projectId,
      };
    }
  }

  const refreshPromise = (async () => {
    const tokens = await refreshAccessToken(blob.refreshToken);
    storeOAuthTokens(accountId, tokens, {
      email: blob.email,
      projectId: blob.projectId,
    });
  })();

  inflightRefreshes.set(accountId, refreshPromise);
  try {
    await refreshPromise;
  } finally {
    inflightRefreshes.delete(accountId);
  }

  const updated = get<OAuthAccountRow>(
    "SELECT id, credential_enc, oauth_enc, oauth_expires_at FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!updated) return null;
  return { apiKey: decrypt(updated.credential_enc), projectId };
}

/** Best-effort check whether an account row carries OAuth data. */
export function isOAuthAccount(accountId: string): boolean {
  const row = get<{ oauth_enc: string | null }>(
    "SELECT oauth_enc FROM provider_accounts WHERE id = ?",
    accountId,
  );
  return parseOAuthBlob(row?.oauth_enc ?? null) !== null;
}

export { CLOCK_SKEW_MS };
