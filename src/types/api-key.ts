/**
 * API key shapes shared by the settings UI.
 *
 * These payloads are the one place the API uses snake_case on the wire — the
 * server passes the `api_keys` row fields through — so the fields are kept
 * verbatim rather than camel-cased on the client.
 */
export interface ApiKey {
  id: string;
  label: string;
  has_key: boolean;
  created_at: string;
  last_used_at: string | null;
  /** Last 4 chars, so a key is identifiable without revealing it. */
  last4: string | null;
  /**
   * Per-key scope. `null` means unrestricted; an empty array means nothing is
   * allowed. Keys created before scoping existed read as all-null.
   */
  allowed_provider_ids: string[] | null;
  allowed_models: string[] | null;
  allowed_combo_ids: string[] | null;
  /** Cumulative token cap, or null for unlimited. */
  token_limit: number | null;
  tokens_used: number;
  request_count: number;
  usage_reset_at: string | null;
}

export interface CreatedApiKey {
  id: string;
  plaintextKey: string;
}

/** Wire body for creating or patching a key's scope. */
export interface ApiKeyRestrictionsPayload {
  allowed_provider_ids?: string[] | null;
  allowed_models?: string[] | null;
  allowed_combo_ids?: string[] | null;
  token_limit?: number | null;
}

/** Editor state for the scope dialog, before it is sent to the server. */
export interface ApiKeyScopeDraft {
  /** Whether the key is limited to specific providers at all. */
  restrictProviders: boolean;
  providerIds: string[];
  restrictModels: boolean;
  /** Values are `prefix/modelId`, matching what GET /v1/models advertises. */
  models: string[];
  restrictCombos: boolean;
  comboIds: string[];
  /** Empty string means no cap. */
  tokenLimit: string;
}

export function draftFromKey(key: ApiKey): ApiKeyScopeDraft {
  return {
    restrictProviders: key.allowed_provider_ids !== null,
    providerIds: key.allowed_provider_ids ?? [],
    restrictModels: key.allowed_models !== null,
    models: key.allowed_models ?? [],
    restrictCombos: key.allowed_combo_ids !== null,
    comboIds: key.allowed_combo_ids ?? [],
    tokenLimit: key.token_limit == null ? "" : String(key.token_limit),
  };
}

/**
 * Turn editor state into the wire body.
 *
 * A disabled toggle sends an explicit null (clear the restriction) rather than
 * omitting the field, so unchecking a box actually widens the scope.
 */
export function draftToPayload(
  draft: ApiKeyScopeDraft,
): ApiKeyRestrictionsPayload {
  const limit = draft.tokenLimit.trim();
  return {
    allowed_provider_ids: draft.restrictProviders ? draft.providerIds : null,
    allowed_models: draft.restrictModels ? draft.models : null,
    allowed_combo_ids: draft.restrictCombos ? draft.comboIds : null,
    token_limit: limit === "" ? null : Number(limit),
  };
}

/** Validation message for a draft, or null when it is safe to save. */
export function validateDraft(draft: ApiKeyScopeDraft): string | null {
  const limit = draft.tokenLimit.trim();
  if (limit !== "") {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return "Token limit must be a positive number, or empty for unlimited.";
    }
  }

  // An empty allowlist is valid but total — worth saying out loud rather than
  // letting someone lock a key out by accident.
  if (draft.restrictProviders && draft.providerIds.length === 0) {
    return "Pick at least one provider, or turn the provider limit off.";
  }
  if (draft.restrictModels && draft.models.length === 0) {
    return "Pick at least one model, or turn the model limit off.";
  }
  if (draft.restrictCombos && draft.comboIds.length === 0) {
    return "Pick at least one combo, or turn the combo limit off.";
  }

  return null;
}
