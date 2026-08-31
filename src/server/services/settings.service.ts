import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type {
  ApiKeyRow,
  AppSettingsRow,
  TokenSaverStatsRow,
} from "../../db/schema";
import {
  DEFAULT_PASSWORD,
  MIN_PASSWORD_LENGTH,
} from "../../lib/password-strength";
import * as ApiKeyScope from "./api-key-scope.service";
import {
  decrypt,
  encrypt,
  generateApiKey,
  hashApiKey,
  hashPassword,
  sha256ApiKey,
  verifyApiKeyHash,
  verifyPassword,
} from "./crypto.service";

function getSettings(): AppSettingsRow {
  const row = get<AppSettingsRow>("SELECT * FROM app_settings WHERE id = 1");
  if (!row) throw new Error("app_settings not initialized");
  return row;
}

/**
 * Re-exported so callers can keep importing it from the service. The value
 * lives in lib/password-strength.ts because the dialog's strength meter needs
 * the same number — a second copy here would be free to drift out of sync.
 */
export { MIN_PASSWORD_LENGTH };

/**
 * Whether the dashboard is still protected by the seeded default password.
 *
 * Derived by verifying the stored hash against DEFAULT_PASSWORD rather than
 * from a persisted flag, so existing installs report correctly without a
 * migration and the answer can never drift out of sync with reality.
 */
export async function isUsingDefaultPassword(): Promise<boolean> {
  const settings = getSettings();
  return verifyPassword(DEFAULT_PASSWORD, settings.password_hash);
}

/**
 * Reject passwords that are too short or equal to the seeded default.
 *
 * Enforced here (not just in the UI) because the forced-change dialog is a
 * client-side prompt — the server is what actually has to hold the line.
 */
function assertPasswordAcceptable(password: string): void {
  // Checked before the length rule: the default ("admin") is shorter than the
  // minimum, so the generic length error would otherwise mask the far more
  // useful "don't reuse the default" message.
  if (password === DEFAULT_PASSWORD) {
    throw new Error(
      "New password cannot be the default password. Choose a different one.",
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const settings = getSettings();
  const valid = await verifyPassword(currentPassword, settings.password_hash);
  if (!valid) throw new Error("Current password is incorrect");

  assertPasswordAcceptable(newPassword);

  const newHash = await hashPassword(newPassword);
  run(
    "UPDATE app_settings SET password_hash = ?, updated_at = ? WHERE id = 1",
    newHash,
    new Date().toISOString(),
  );
}

export async function verifyLoginPassword(password: string): Promise<boolean> {
  const settings = getSettings();
  return verifyPassword(password, settings.password_hash);
}

export async function setPasswordHash(hash: string): Promise<void> {
  run(
    "UPDATE app_settings SET password_hash = ?, updated_at = ? WHERE id = 1",
    hash,
    new Date().toISOString(),
  );
}

export async function getTheme(): Promise<"light" | "dark" | "system"> {
  const settings = getSettings();
  return settings.theme;
}

export async function setTheme(
  theme: "light" | "dark" | "system",
): Promise<void> {
  run(
    "UPDATE app_settings SET theme = ?, updated_at = ? WHERE id = 1",
    theme,
    new Date().toISOString(),
  );
}

export function getTokenSaverDefault(): boolean {
  const settings = getSettings();
  return settings.token_saver_default_enabled === 1;
}

export async function setTokenSaverDefault(enabled: boolean): Promise<void> {
  run(
    "UPDATE app_settings SET token_saver_default_enabled = ?, updated_at = ? WHERE id = 1",
    enabled ? 1 : 0,
    new Date().toISOString(),
  );
}

export function getCavemanSettings(): { enabled: boolean; level: string } {
  const settings = getSettings();
  return {
    enabled: settings.caveman_enabled === 1,
    level: settings.caveman_level || "full",
  };
}

export async function setCavemanEnabled(enabled: boolean): Promise<void> {
  run(
    "UPDATE app_settings SET caveman_enabled = ?, updated_at = ? WHERE id = 1",
    enabled ? 1 : 0,
    new Date().toISOString(),
  );
}

export async function setCavemanLevel(level: string): Promise<void> {
  run(
    "UPDATE app_settings SET caveman_level = ?, updated_at = ? WHERE id = 1",
    level,
    new Date().toISOString(),
  );
}

export function getPonytailSettings(): { enabled: boolean; level: string } {
  const settings = getSettings();
  return {
    enabled: settings.ponytail_enabled === 1,
    level: settings.ponytail_level || "full",
  };
}

export async function setPonytailEnabled(enabled: boolean): Promise<void> {
  run(
    "UPDATE app_settings SET ponytail_enabled = ?, updated_at = ? WHERE id = 1",
    enabled ? 1 : 0,
    new Date().toISOString(),
  );
}

export async function setPonytailLevel(level: string): Promise<void> {
  run(
    "UPDATE app_settings SET ponytail_level = ?, updated_at = ? WHERE id = 1",
    level,
    new Date().toISOString(),
  );
}

export interface TokenSaverStats {
  totalTokensSaved: number;
  updatedAt: string;
}

export function getTokenSaverStats(): TokenSaverStats {
  const row = get<TokenSaverStatsRow>(
    "SELECT * FROM token_saver_stats WHERE id = 1",
  );
  if (!row) throw new Error("token_saver_stats not initialized");

  return {
    totalTokensSaved: row.total_tokens_saved,
    updatedAt: row.updated_at,
  };
}

export function recordTokenSaverSavings(tokensSaved: number): void {
  if (!Number.isFinite(tokensSaved) || tokensSaved <= 0) return;

  run(
    "UPDATE token_saver_stats SET total_tokens_saved = total_tokens_saved + ?, updated_at = ? WHERE id = 1",
    Math.round(tokensSaved),
    new Date().toISOString(),
  );
}

export interface ApiKeyPublic {
  id: string;
  label: string;
  has_key: boolean;
  created_at: string;
  last_used_at: string | null;
  /**
   * Per-key scope. A null list means unrestricted — see api-key-scope.service.
   */
  allowed_provider_ids: string[] | null;
  allowed_models: string[] | null;
  allowed_combo_ids: string[] | null;
  token_limit: number | null;
  tokens_used: number;
  request_count: number;
  usage_reset_at: string | null;
  /**
   * Last 4 characters of the key, or null when the key predates encryption.
   *
   * Lets a client tell *which* stored key a saved config refers to without
   * fetching plaintext. Without it the CLI-tool form had to request every key's
   * plaintext and compare — N requests that pulled every secret into the
   * browser just to render one label.
   */
  last4: string | null;
}

/** Non-reversible tail of a key, safe to show in a picker. */
function keyTail(keyEnc: string | null): string | null {
  if (!keyEnc) return null;
  try {
    const plaintext = decrypt(keyEnc);
    return plaintext.length >= 4 ? plaintext.slice(-4) : null;
  } catch {
    return null;
  }
}

export async function createApiKey(
  label: string,
  restrictions?: ApiKeyScope.ApiKeyRestrictionsUpdate,
): Promise<{ id: string; plaintextKey: string }> {
  if (!label || label.trim().length === 0) throw new Error("Label is required");

  const id = `key_${randomBytes(16).toString("hex")}`;
  const plaintextKey = generateApiKey();
  const keyHash = await hashApiKey(plaintextKey);
  const keyEnc = encrypt(plaintextKey);
  const now = new Date().toISOString();

  run(
    "INSERT INTO api_keys (id, label, key_hash, key_enc, key_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    label.trim(),
    keyHash,
    keyEnc,
    sha256ApiKey(plaintextKey),
    now,
  );

  // Applied as a follow-up update so the column defaults (all-null =
  // unrestricted) stay the single definition of an unscoped key.
  if (restrictions) ApiKeyScope.updateRestrictions(id, restrictions);

  return { id, plaintextKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  const row = get<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?", id);
  if (!row) throw new Error("API key not found");

  run("DELETE FROM api_keys WHERE id = ?", id);
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  const rows = query<ApiKeyRow>(
    `SELECT id, label, key_enc, created_at, last_used_at,
            allowed_provider_ids, allowed_models, allowed_combo_ids,
            token_limit, tokens_used, request_count, usage_reset_at
     FROM api_keys ORDER BY created_at DESC`,
  );
  return rows.map((r) => {
    const restrictions = ApiKeyScope.toRestrictions(r);
    const usage = ApiKeyScope.toUsage(r);
    return {
      id: r.id,
      label: r.label,
      has_key: !!r.key_enc,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      allowed_provider_ids: restrictions.allowedProviderIds,
      allowed_models: restrictions.allowedModels,
      allowed_combo_ids: restrictions.allowedComboIds,
      token_limit: restrictions.tokenLimit,
      tokens_used: usage.tokensUsed,
      request_count: usage.requestCount,
      usage_reset_at: usage.usageResetAt,
      last4: keyTail(r.key_enc),
    };
  });
}

function markKeyUsed(id: string): void {
  run(
    "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
    new Date().toISOString(),
    id,
  );
}

/**
 * Resolve a plaintext API key to its row, or null when it matches nothing.
 *
 * Two paths, in order:
 *
 * 1. An indexed SHA-256 lookup. This is the path every key created since
 *    migration 020 (and every backfilled one) takes.
 * 2. An argon2id scan over the rows that have no digest — only keys predating
 *    migration 009, which have no `key_enc` to derive one from.
 *
 * The scan used to be the *only* path, and it dominated request latency: an
 * argon2 comparison costs ~190ms whether it matches or not, so authenticating
 * one proxy request cost ~190ms x (number of keys). A digest is the right
 * primitive because these keys are 32 random bytes — there is no dictionary to
 * defend against, so the slow KDF protected nothing.
 */
export async function verifyApiKey(
  plaintext: string,
): Promise<ApiKeyRow | null> {
  const digest = sha256ApiKey(plaintext);
  const hit = get<ApiKeyRow>(
    "SELECT * FROM api_keys WHERE key_sha256 = ?",
    digest,
  );
  if (hit) {
    markKeyUsed(hit.id);
    return hit;
  }

  // Legacy rows only. Once these are gone (or recreated) auth never leaves the
  // fast path above.
  const legacy = query<ApiKeyRow>(
    "SELECT * FROM api_keys WHERE key_sha256 IS NULL",
  );
  for (const row of legacy) {
    if (await verifyApiKeyHash(plaintext, row.key_hash)) {
      // Promote it, so this key pays the argon2 cost at most once more. The
      // plaintext is only available here, during a successful verification.
      run("UPDATE api_keys SET key_sha256 = ? WHERE id = ?", digest, row.id);
      markKeyUsed(row.id);
      return { ...row, key_sha256: digest };
    }
  }

  return null;
}

export function getDecryptedApiKey(id: string): string {
  const row = get<ApiKeyRow>("SELECT key_enc FROM api_keys WHERE id = ?", id);
  if (!row) throw new Error("API key not found");
  if (!row.key_enc)
    throw new Error(
      "API key was created before encryption was enabled. Recreate it.",
    );
  return decrypt(row.key_enc);
}
