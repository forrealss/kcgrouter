/**
 * Per-API-key scoping and token budget.
 *
 * Kept out of settings.service.ts so the router can pull in the enforcement
 * helpers without dragging password hashing and app preferences along with
 * them. The `api_keys` row is the single source of truth — see migration 019.
 */
import { get, run } from "../../db/client";
import type { ApiKeyRow } from "../../db/schema";

/**
 * A key's scope, as the API and UI see it.
 *
 * `null` on a list means unrestricted, which is deliberately different from an
 * empty array (allow nothing). Every key that predates migration 019 reads as
 * all-null, preserving the original "one key, full access" behaviour.
 */
export interface ApiKeyRestrictions {
  /** Provider ids the key may reach, or null for any provider. */
  allowedProviderIds: string[] | null;
  /**
   * Models the key may run, or null for any model.
   *
   * Entries are matched against the model actually dispatched upstream, in
   * both bare (`gpt-4o`) and prefixed (`openai/gpt-4o`) form — a combo member
   * resolves to a bare model name, while a direct request carries the prefix.
   */
  allowedModels: string[] | null;
  /** Combo ids the key may route through, or null for any combo. */
  allowedComboIds: string[] | null;
  /** Cumulative token cap, or null for unlimited. */
  tokenLimit: number | null;
}

/** Restrictions plus the counters, for display. */
export interface ApiKeyUsage {
  tokensUsed: number;
  requestCount: number;
  usageResetAt: string | null;
}

/** A key with no restrictions at all — the pre-019 behaviour. */
export const UNRESTRICTED: ApiKeyRestrictions = {
  allowedProviderIds: null,
  allowedModels: null,
  allowedComboIds: null,
  tokenLimit: null,
};

/**
 * Parse a stored JSON array column.
 *
 * A malformed or non-array value is treated as unrestricted rather than
 * throwing: a corrupt column should not take the proxy down, and the operator
 * sees the field as empty in the UI and can re-save it.
 */
function parseList(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
}

/** Serialize a list back to its column form, collapsing empties to a JSON array. */
function serializeList(list: string[] | null | undefined): string | null {
  if (list == null) return null;
  const cleaned = [
    ...new Set(list.map((v) => v.trim()).filter((v) => v.length > 0)),
  ];
  return JSON.stringify(cleaned);
}

export function toRestrictions(row: ApiKeyRow): ApiKeyRestrictions {
  return {
    allowedProviderIds: parseList(row.allowed_provider_ids),
    allowedModels: parseList(row.allowed_models),
    allowedComboIds: parseList(row.allowed_combo_ids),
    tokenLimit: row.token_limit ?? null,
  };
}

export function toUsage(row: ApiKeyRow): ApiKeyUsage {
  return {
    tokensUsed: row.tokens_used ?? 0,
    requestCount: row.request_count ?? 0,
    usageResetAt: row.usage_reset_at ?? null,
  };
}

export function getRestrictions(keyId: string): ApiKeyRestrictions | null {
  const row = get<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?", keyId);
  return row ? toRestrictions(row) : null;
}

/** Partial update — an omitted field is left as-is, an explicit null clears it. */
export interface ApiKeyRestrictionsUpdate {
  allowedProviderIds?: string[] | null;
  allowedModels?: string[] | null;
  allowedComboIds?: string[] | null;
  tokenLimit?: number | null;
}

export function updateRestrictions(
  keyId: string,
  update: ApiKeyRestrictionsUpdate,
): ApiKeyRestrictions {
  const row = get<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?", keyId);
  if (!row) throw new Error("API key not found");

  if (update.tokenLimit != null) {
    if (!Number.isFinite(update.tokenLimit) || update.tokenLimit <= 0) {
      throw new Error("Token limit must be a positive number, or null");
    }
  }

  // Only touch the columns the caller actually sent, so a PATCH that edits the
  // token cap cannot silently wipe the model allowlist.
  const assignments: string[] = [];
  const params: (string | number | null)[] = [];

  if ("allowedProviderIds" in update) {
    assignments.push("allowed_provider_ids = ?");
    params.push(serializeList(update.allowedProviderIds));
  }
  if ("allowedModels" in update) {
    assignments.push("allowed_models = ?");
    params.push(serializeList(update.allowedModels));
  }
  if ("allowedComboIds" in update) {
    assignments.push("allowed_combo_ids = ?");
    params.push(serializeList(update.allowedComboIds));
  }
  if ("tokenLimit" in update) {
    assignments.push("token_limit = ?");
    params.push(
      update.tokenLimit == null ? null : Math.round(update.tokenLimit),
    );
  }

  if (assignments.length === 0) return toRestrictions(row);

  run(
    `UPDATE api_keys SET ${assignments.join(", ")} WHERE id = ?`,
    ...params,
    keyId,
  );

  const updated = get<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?", keyId);
  if (!updated) throw new Error("API key not found");
  return toRestrictions(updated);
}

/**
 * Whether the key still has budget left.
 *
 * Tokens are only known once a response completes, so a request that crosses
 * the cap runs to completion and the *next* one is refused — the same tradeoff
 * the per-account quota makes.
 */
export function hasBudget(keyId: string): boolean {
  const row = get<{ token_limit: number | null; tokens_used: number }>(
    "SELECT token_limit, tokens_used FROM api_keys WHERE id = ?",
    keyId,
  );
  if (!row) return false;
  if (row.token_limit == null) return true;
  return (row.tokens_used ?? 0) < row.token_limit;
}

/** Add a completed request's tokens to the key's running total. */
export function recordUsage(keyId: string, tokens: number): void {
  const amount = Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0;
  run(
    "UPDATE api_keys SET tokens_used = tokens_used + ?, request_count = request_count + 1 WHERE id = ?",
    amount,
    keyId,
  );
}

/** Zero the counters and stamp when that happened. */
export function resetUsage(keyId: string): void {
  const row = get<ApiKeyRow>("SELECT id FROM api_keys WHERE id = ?", keyId);
  if (!row) throw new Error("API key not found");

  run(
    "UPDATE api_keys SET tokens_used = 0, request_count = 0, usage_reset_at = ? WHERE id = ?",
    new Date().toISOString(),
    keyId,
  );
}

/** Why a request was refused, for the 403 body and the request log. */
export type DenialReason = "provider" | "model" | "combo" | "budget";

export interface Denial {
  reason: DenialReason;
  message: string;
}

function isAllowed(list: string[] | null, value: string): boolean {
  if (list == null) return true;
  return list.includes(value);
}

/**
 * Match a model against the allowlist in both bare and prefixed form.
 *
 * A combo member stores a bare model name while a direct request arrives as
 * `prefix/model`, and the UI offers the prefixed form (it mirrors what
 * `GET /v1/models` advertises). Accepting either means one allowlist entry
 * covers the same model however it is reached.
 */
function isModelAllowed(
  list: string[] | null,
  modelName: string,
  providerPrefix: string | null,
): boolean {
  if (list == null) return true;
  if (list.includes(modelName)) return true;
  if (providerPrefix && list.includes(`${providerPrefix}/${modelName}`)) {
    return true;
  }
  // The caller may already hold a prefixed name (a direct request that was not
  // split); compare its bare tail too so the entry forms stay interchangeable.
  const slash = modelName.indexOf("/");
  return slash !== -1 && list.includes(modelName.slice(slash + 1));
}

/**
 * Check one resolved dispatch target against a key's scope.
 *
 * Called per failover hop rather than once up front, because a combo resolves
 * to a different provider and model on each attempt — checking only the
 * client's requested string would let a combo reach a provider or model the
 * key was never granted.
 */
export function checkTarget(
  restrictions: ApiKeyRestrictions,
  target: {
    providerId: string;
    providerName: string;
    providerPrefix: string | null;
    modelName: string;
    comboId: string | null;
    comboName?: string | null;
  },
): Denial | null {
  if (!isAllowed(restrictions.allowedProviderIds, target.providerId)) {
    return {
      reason: "provider",
      message: `This API key is not allowed to use provider "${target.providerName}"`,
    };
  }

  if (
    !isModelAllowed(
      restrictions.allowedModels,
      target.modelName,
      target.providerPrefix,
    )
  ) {
    return {
      reason: "model",
      message: `This API key is not allowed to use model "${target.modelName}"`,
    };
  }

  if (
    target.comboId &&
    !isAllowed(restrictions.allowedComboIds, target.comboId)
  ) {
    return {
      reason: "combo",
      message: `This API key is not allowed to use combo "${target.comboName ?? target.comboId}"`,
    };
  }

  return null;
}
