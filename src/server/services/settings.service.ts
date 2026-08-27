import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type {
  ApiKeyRow,
  AppSettingsRow,
  TokenSaverStatsRow,
} from "../../db/schema";
import {
  decrypt,
  encrypt,
  generateApiKey,
  hashApiKey,
  hashPassword,
  verifyApiKeyHash,
  verifyPassword,
} from "./crypto.service";

function getSettings(): AppSettingsRow {
  const row = get<AppSettingsRow>("SELECT * FROM app_settings WHERE id = 1");
  if (!row) throw new Error("app_settings not initialized");
  return row;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const settings = getSettings();
  const valid = await verifyPassword(currentPassword, settings.password_hash);
  if (!valid) throw new Error("Current password is incorrect");

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
): Promise<{ id: string; plaintextKey: string }> {
  if (!label || label.trim().length === 0) throw new Error("Label is required");

  const id = `key_${randomBytes(16).toString("hex")}`;
  const plaintextKey = generateApiKey();
  const keyHash = await hashApiKey(plaintextKey);
  const keyEnc = encrypt(plaintextKey);
  const now = new Date().toISOString();

  run(
    "INSERT INTO api_keys (id, label, key_hash, key_enc, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    label.trim(),
    keyHash,
    keyEnc,
    now,
  );

  return { id, plaintextKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  const row = get<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?", id);
  if (!row) throw new Error("API key not found");

  run("DELETE FROM api_keys WHERE id = ?", id);
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  const rows = query<ApiKeyRow>(
    "SELECT id, label, key_enc, created_at, last_used_at FROM api_keys ORDER BY created_at DESC",
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    has_key: !!r.key_enc,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    last4: keyTail(r.key_enc),
  }));
}

export async function verifyApiKey(
  plaintext: string,
): Promise<ApiKeyRow | null> {
  const rows = query<ApiKeyRow>("SELECT * FROM api_keys");
  for (const row of rows) {
    const valid = await verifyApiKeyHash(plaintext, row.key_hash);
    if (valid) {
      run(
        "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
        new Date().toISOString(),
        row.id,
      );
      return row;
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
