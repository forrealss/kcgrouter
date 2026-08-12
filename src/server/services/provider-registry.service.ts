import type { SQLQueryBindings } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type {
  AccountStatus,
  ProviderAccountRow,
  ProviderRow,
  ProviderTransport,
} from "../../db/schema";
import type { RetryConfig } from "../providers/retry";
import { decrypt, encrypt } from "./crypto.service";
import * as EventBus from "./event-bus";
import type { ErrorKind } from "./quota-tracker.service";

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
  /** Per-status retry policy, or null to use the global defaults. */
  retryConfig: RetryConfig | null;
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
  cooldownUntil: string | null;
  backoffLevel: number;
  createdAt: string;
}

/**
 * Account cooldown tuning (mirrors 9router's errorConfig):
 *   - rate_limit: exponential backoff — 1s, 2s, 4s, ... capped at 4 min.
 *   - server_error: short fixed cooldown (transient blips self-heal quickly).
 *   - auth: long fixed cooldown — a bad key won't fix itself, so back off hard.
 */
const COOLDOWN_CONFIG = {
  rateLimitBaseMs: 1_000,
  rateLimitMaxMs: 240_000,
  maxBackoffLevel: 8,
  serverErrorMs: 10_000,
  authMs: 300_000,
} as const;

/**
 * Compute the cooldown duration + next backoff level for an error kind.
 * Mirrors 9router `getQuotaCooldown` (base * 2^level, capped) for rate limits.
 *
 * `minCooldownMs` (e.g. an upstream `Retry-After` hint) is honored as a floor
 * — never let the cooldown be shorter than what the upstream asked for.
 */
export function computeCooldownMs(
  kind: ErrorKind,
  backoffLevel: number,
  minCooldownMs?: number,
): { cooldownMs: number; newBackoffLevel: number } {
  let cooldownMs: number;
  let newBackoffLevel: number;

  if (kind === "rate_limit") {
    newBackoffLevel = Math.min(
      backoffLevel + 1,
      COOLDOWN_CONFIG.maxBackoffLevel,
    );
    const ms =
      COOLDOWN_CONFIG.rateLimitBaseMs * 2 ** Math.max(0, newBackoffLevel - 1);
    cooldownMs = Math.min(ms, COOLDOWN_CONFIG.rateLimitMaxMs);
  } else if (kind === "auth") {
    cooldownMs = COOLDOWN_CONFIG.authMs;
    newBackoffLevel = 0;
  } else {
    cooldownMs = COOLDOWN_CONFIG.serverErrorMs;
    newBackoffLevel = 0;
  }

  if (minCooldownMs && minCooldownMs > cooldownMs) {
    cooldownMs = minCooldownMs;
  }
  return { cooldownMs, newBackoffLevel };
}

/** Whether the account is currently in its post-error cooldown window. */
export function isAccountCoolingDown(account: ProviderAccount): boolean {
  if (!account.cooldownUntil) return false;
  return new Date(account.cooldownUntil).getTime() > Date.now();
}

/**
 * Whether an account can serve a request right now: not permanently expired
 * and not inside a cooldown window. An `error`-status account whose cooldown
 * expired is usable again — this is the auto-recovery path.
 */
export function isAccountAvailable(account: ProviderAccount): boolean {
  if (account.status === "expired") return false;
  return !isAccountCoolingDown(account);
}

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function parseRetryConfig(raw: string | null): RetryConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const config: RetryConfig = {};
    for (const [status, rule] of Object.entries(parsed)) {
      const statusNum = Number(status);
      if (
        !Number.isInteger(statusNum) ||
        statusNum < 100 ||
        statusNum > 599 ||
        !rule ||
        typeof rule !== "object" ||
        typeof (rule as { attempts?: unknown }).attempts !== "number" ||
        typeof (rule as { delayMs?: unknown }).delayMs !== "number"
      ) {
        continue;
      }
      config[statusNum] = {
        attempts: (rule as { attempts: number }).attempts,
        delayMs: (rule as { delayMs: number }).delayMs,
      };
    }
    return Object.keys(config).length > 0 ? config : null;
  } catch {
    return null;
  }
}

function rowToProvider(row: ProviderRow, accountCount: number): Provider {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    baseUrl: row.base_url,
    isBuiltin: row.is_builtin === 1,
    prefix: row.prefix,
    retryConfig: parseRetryConfig(row.retry_config),
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
    cooldownUntil: row.cooldown_until,
    backoffLevel: row.backoff_level ?? 0,
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
    retryConfig: null,
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
    retryConfig: parseRetryConfig(r.retry_config),
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

/**
 * Persist a per-provider retry policy, or clear it (null) to fall back to the
 * global defaults. Invalid rules are rejected here so the router never has to
 * defend against malformed rows.
 */
export function updateProviderRetryConfig(
  providerId: string,
  config: RetryConfig | null,
): Provider {
  const existing = get<ProviderRow>(
    "SELECT id FROM providers WHERE id = ?",
    providerId,
  );
  if (!existing) throw new Error("Provider not found");

  if (config !== null) {
    for (const [status, rule] of Object.entries(config)) {
      if (!rule) continue;
      const statusNum = Number(status);
      if (!Number.isInteger(statusNum) || statusNum < 100 || statusNum > 599) {
        throw new Error(
          "Retry config status codes must be between 100 and 599",
        );
      }
      if (!Number.isInteger(rule.attempts) || rule.attempts < 0) {
        throw new Error("Retry attempts must be a non-negative integer");
      }
      if (!Number.isFinite(rule.delayMs) || rule.delayMs < 0) {
        throw new Error("Retry delayMs must be a non-negative number");
      }
    }
  }

  run(
    "UPDATE providers SET retry_config = ? WHERE id = ?",
    config === null ? null : JSON.stringify(config),
    providerId,
  );

  const updated = getProvider(providerId);
  if (!updated) throw new Error("Provider not found after update");
  return updated;
}

/** Number of accounts currently inside their post-error cooldown window. */
export function countCoolingDownAccounts(): number {
  const row = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM provider_accounts
     WHERE cooldown_until IS NOT NULL AND cooldown_until > ?`,
    new Date().toISOString(),
  );
  return row?.c ?? 0;
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
    cooldownUntil: null,
    backoffLevel: 0,
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
  const values: SQLQueryBindings[] = [];

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
    updates.push("cooldown_until = NULL");
    updates.push("backoff_level = 0");
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

/**
 * Record an upstream failure and put the account into a cooldown window.
 * The cooldown (and backoff level for rate limits) is computed from the error
 * kind; `minCooldownMs` (e.g. an upstream `Retry-After` hint) is honored as a
 * floor. Once the cooldown expires the account is usable again automatically.
 */
export function recordAccountError(
  accountId: string,
  message: string,
  errorKind: ErrorKind = "server_error",
  minCooldownMs?: number,
): void {
  const now = new Date().toISOString();
  const current = get<{ backoff_level: number }>(
    "SELECT backoff_level FROM provider_accounts WHERE id = ?",
    accountId,
  );
  const { cooldownMs, newBackoffLevel } = computeCooldownMs(
    errorKind,
    current?.backoff_level ?? 0,
    minCooldownMs,
  );
  const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();

  run(
    `UPDATE provider_accounts
     SET status = 'error', last_error = ?, last_error_at = ?,
         cooldown_until = ?, backoff_level = ?
     WHERE id = ?`,
    message,
    now,
    cooldownUntil,
    newBackoffLevel,
    accountId,
  );

  EventBus.publish("account:cooldown", {
    accountId,
    message,
    errorKind,
    cooldownMs,
    cooldownUntil,
  });
}

export function recordAccountSuccess(accountId: string): void {
  const now = new Date().toISOString();
  run(
    `UPDATE provider_accounts
     SET status = 'active', last_error = NULL, last_error_at = NULL,
         cooldown_until = NULL, backoff_level = 0, last_used_at = ?
     WHERE id = ?`,
    now,
    accountId,
  );

  EventBus.publish("account:recovered", { accountId });
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
