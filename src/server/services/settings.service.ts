import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type { ApiKeyRow, AppSettingsRow } from "../../db/schema";
import {
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

export async function getTheme(): Promise<"light" | "dark"> {
  const settings = getSettings();
  return settings.theme;
}

export async function setTheme(theme: "light" | "dark"): Promise<void> {
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

export interface ApiKeyPublic {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function createApiKey(
  label: string,
): Promise<{ id: string; plaintextKey: string }> {
  if (!label || label.trim().length === 0) throw new Error("Label is required");

  const id = `key_${randomBytes(16).toString("hex")}`;
  const plaintextKey = generateApiKey();
  const keyHash = await hashApiKey(plaintextKey);
  const now = new Date().toISOString();

  run(
    "INSERT INTO api_keys (id, label, key_hash, created_at) VALUES (?, ?, ?, ?)",
    id,
    label.trim(),
    keyHash,
    now,
  );

  return { id, plaintextKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  const row = get<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?", id);
  if (!row) throw new Error("API key not found");
  if (row.revoked_at) throw new Error("API key already revoked");

  run(
    "UPDATE api_keys SET revoked_at = ? WHERE id = ?",
    new Date().toISOString(),
    id,
  );
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  const rows = query<ApiKeyRow>(
    "SELECT id, label, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC",
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    revoked_at: r.revoked_at,
  }));
}

export async function verifyApiKey(
  plaintext: string,
): Promise<ApiKeyRow | null> {
  const rows = query<ApiKeyRow>(
    "SELECT * FROM api_keys WHERE revoked_at IS NULL",
  );
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
