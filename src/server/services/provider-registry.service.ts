import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type {
  AccountStatus,
  ProviderAccountRow,
  ProviderRow,
  ProviderTransport,
} from "../../db/schema";
import { decrypt, encrypt } from "./crypto.service";

const VALID_TRANSPORTS: ProviderTransport[] = [
  "openai",
  "anthropic",
  "gemini",
  "kiro",
  "command-code",
  "mimo",
  "qoder",
];

export interface NewProviderInput {
  name: string;
  transport: ProviderTransport;
  baseUrl: string;
  prefix: string;
}

export interface NewAccountInput {
  label: string;
  apiKey: string;
  quotaLimitTokens?: number | null;
}

export interface Provider {
  id: string;
  name: string;
  transport: ProviderTransport;
  baseUrl: string;
  isBuiltin: boolean;
  prefix: string;
  createdAt: string;
  accountCount?: number;
}

export interface ProviderAccount {
  id: string;
  providerId: string;
  label: string;
  status: AccountStatus;
  quotaLimitTokens: number | null;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
}

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function rowToProvider(row: ProviderRow, accountCount: number): Provider {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    baseUrl: row.base_url,
    isBuiltin: row.is_builtin === 1,
    prefix: row.prefix,
    createdAt: row.created_at,
    accountCount,
  };
}

function rowToAccount(row: ProviderAccountRow): ProviderAccount {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    status: row.status,
    quotaLimitTokens: row.quota_limit_tokens,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
  };
}

// --- Provider CRUD ---

export function createProvider(input: NewProviderInput): Provider {
  if (!input.name || input.name.trim().length === 0)
    throw new Error("Provider name is required");
  if (!VALID_TRANSPORTS.includes(input.transport)) {
    throw new Error(
      `Invalid transport: ${input.transport}. Must be one of: ${VALID_TRANSPORTS.join(", ")}`,
    );
  }
  if (!input.baseUrl || input.baseUrl.trim().length === 0)
    throw new Error("Base URL is required");
  if (!input.prefix || input.prefix.trim().length === 0)
    throw new Error("Provider prefix is required");

  const normalizedPrefix = input.prefix.trim().toLowerCase();

  // Validate prefix format (alphanumeric, hyphens, dots only)
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(normalizedPrefix)) {
    throw new Error(
      "Prefix must start with a letter or number and contain only lowercase letters, numbers, hyphens, and dots",
    );
  }

  // Check prefix uniqueness
  const existingPrefix = get<ProviderRow>(
    "SELECT id FROM providers WHERE prefix = ?",
    normalizedPrefix,
  );
  if (existingPrefix) {
    throw new Error(
      `Prefix "${normalizedPrefix}" is already used by another provider`,
    );
  }

  // Check name uniqueness
  const existing = get<ProviderRow>(
    "SELECT id FROM providers WHERE name = ?",
    input.name.trim(),
  );
  if (existing) throw new Error(`Provider name "${input.name}" already exists`);

  const id = generateId("prov");
  const now = new Date().toISOString();

  run(
    "INSERT INTO providers (id, name, transport, base_url, is_builtin, prefix, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
    id,
    input.name.trim(),
    input.transport,
    input.baseUrl.trim(),
    normalizedPrefix,
    now,
  );

  return {
    id,
    name: input.name.trim(),
    transport: input.transport,
    baseUrl: input.baseUrl.trim(),
    isBuiltin: false,
    prefix: normalizedPrefix,
    createdAt: now,
    accountCount: 0,
  };
}

export function listProviders(): Provider[] {
  const rows = query<ProviderRow & { account_count: number }>(
    `SELECT p.*, COUNT(pa.id) as account_count
     FROM providers p
     LEFT JOIN provider_accounts pa ON pa.provider_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    transport: r.transport,
    baseUrl: r.base_url,
    isBuiltin: r.is_builtin === 1,
    prefix: r.prefix,
    createdAt: r.created_at,
    accountCount: r.account_count,
  }));
}

export function getProvider(id: string): Provider | null {
  const row = get<ProviderRow & { account_count: number }>(
    `SELECT p.*, COUNT(pa.id) as account_count
     FROM providers p
     LEFT JOIN provider_accounts pa ON pa.provider_id = p.id
     WHERE p.id = ?
     GROUP BY p.id`,
    id,
  );
  if (!row) return null;
  return rowToProvider(row, row.account_count);
}

export function getProviderByPrefix(prefix: string): Provider | null {
  const row = get<ProviderRow & { account_count: number }>(
    `SELECT p.*, COUNT(pa.id) as account_count
     FROM providers p
     LEFT JOIN provider_accounts pa ON pa.provider_id = p.id
     WHERE p.prefix = ?
     GROUP BY p.id`,
    prefix.toLowerCase(),
  );
  if (!row) return null;
  return rowToProvider(row, row.account_count);
}

export function deleteProvider(providerId: string): void {
  const existing = get<ProviderRow>(
    "SELECT id, is_builtin FROM providers WHERE id = ?",
    providerId,
  );
  if (!existing) throw new Error("Provider not found");
  if (existing.is_builtin === 1) {
    throw new Error("Cannot delete built-in provider");
  }

  run("DELETE FROM providers WHERE id = ?", providerId);
}

// --- Provider Account CRUD ---

export function addAccount(
  providerId: string,
  input: NewAccountInput,
): ProviderAccount {
  const provider = getProvider(providerId);
  if (!provider) throw new Error("Provider not found");

  if (!input.label || input.label.trim().length === 0)
    throw new Error("Label is required");
  if (!input.apiKey || input.apiKey.trim().length === 0)
    throw new Error("API key is required");

  if (input.quotaLimitTokens != null && input.quotaLimitTokens <= 0) {
    throw new Error("quota_limit_tokens must be a positive number or null");
  }

  const id = generateId("acct");
  const credentialEnc = encrypt(input.apiKey);
  const now = new Date().toISOString();

  run(
    `INSERT INTO provider_accounts (id, provider_id, label, status, credential_enc, quota_limit_tokens, created_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`,
    id,
    providerId,
    input.label.trim(),
    credentialEnc,
    input.quotaLimitTokens ?? null,
    now,
  );

  run(
    "INSERT INTO quota_state (account_id, tokens_used, request_count) VALUES (?, 0, 0)",
    id,
  );

  return {
    id,
    providerId,
    label: input.label.trim(),
    status: "active",
    quotaLimitTokens: input.quotaLimitTokens ?? null,
    lastUsedAt: null,
    lastError: null,
    lastErrorAt: null,
    createdAt: now,
  };
}

export function updateAccount(
  accountId: string,
  patch: Partial<NewAccountInput>,
): ProviderAccount {
  const existing = get<ProviderAccountRow>(
    "SELECT * FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!existing) throw new Error("Provider account not found");

  const updates: string[] = [];
  const values: unknown[] = [];

  if (patch.label !== undefined) {
    if (!patch.label || patch.label.trim().length === 0)
      throw new Error("Label cannot be empty");
    updates.push("label = ?");
    values.push(patch.label.trim());
  }

  if (patch.apiKey !== undefined) {
    if (!patch.apiKey || patch.apiKey.trim().length === 0)
      throw new Error("API key cannot be empty");
    updates.push("credential_enc = ?");
    values.push(encrypt(patch.apiKey));
    // A fresh credential should clear any previous upstream error state.
    updates.push("status = 'active'");
    updates.push("last_error = NULL");
    updates.push("last_error_at = NULL");
  }

  if (patch.quotaLimitTokens !== undefined) {
    if (patch.quotaLimitTokens != null && patch.quotaLimitTokens <= 0) {
      throw new Error("quota_limit_tokens must be a positive number or null");
    }
    updates.push("quota_limit_tokens = ?");
    values.push(patch.quotaLimitTokens ?? null);
  }

  if (updates.length > 0) {
    values.push(accountId);
    run(
      `UPDATE provider_accounts SET ${updates.join(", ")} WHERE id = ?`,
      ...values,
    );
  }

  const updated = get<ProviderAccountRow>(
    "SELECT * FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!updated) throw new Error("Provider account not found after update");
  return rowToAccount(updated);
}

export function removeAccount(accountId: string): void {
  const existing = get<ProviderAccountRow>(
    "SELECT id FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!existing) throw new Error("Provider account not found");

  run("DELETE FROM provider_accounts WHERE id = ?", accountId);
}

export function getAccount(accountId: string): ProviderAccount | null {
  const row = get<ProviderAccountRow>(
    "SELECT * FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!row) return null;
  return rowToAccount(row);
}

export function listAccounts(providerId: string): ProviderAccount[] {
  const rows = query<ProviderAccountRow>(
    "SELECT * FROM provider_accounts WHERE provider_id = ? ORDER BY created_at DESC",
    providerId,
  );
  return rows.map(rowToAccount);
}

export function recordAccountError(accountId: string, message: string): void {
  const now = new Date().toISOString();
  run(
    "UPDATE provider_accounts SET status = 'error', last_error = ?, last_error_at = ? WHERE id = ?",
    message,
    now,
    accountId,
  );
}

export function recordAccountSuccess(accountId: string): void {
  const now = new Date().toISOString();
  run(
    "UPDATE provider_accounts SET status = 'active', last_error = NULL, last_error_at = NULL, last_used_at = ? WHERE id = ?",
    now,
    accountId,
  );
}

export function getDecryptedCredential(accountId: string): { apiKey: string } {
  const row = get<ProviderAccountRow>(
    "SELECT * FROM provider_accounts WHERE id = ?",
    accountId,
  );
  if (!row) throw new Error("Provider account not found");

  const apiKey = decrypt(row.credential_enc);
  return { apiKey };
}
