export interface AppSettingsRow {
  id: 1;
  password_hash: string;
  theme: "light" | "dark" | "system";
  token_saver_default_enabled: 0 | 1;
  caveman_enabled: 0 | 1;
  caveman_level: string;
  ponytail_enabled: 0 | 1;
  ponytail_level: string;
  created_at: string;
  updated_at: string;
}

export interface TokenSaverStatsRow {
  id: 1;
  total_tokens_saved: number;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  label: string;
  key_hash: string;
  key_enc: string | null;
  /**
   * SHA-256 of the plaintext key — the indexed fast path for auth.
   *
   * NULL only for keys created before migration 009, which have no `key_enc`
   * to derive it from; those fall back to the argon2 `key_hash` comparison.
   */
  key_sha256: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /**
   * Per-key scoping, each a JSON array of ids/names or NULL.
   *
   * NULL and `[]` mean different things: NULL is "unrestricted" (the behaviour
   * every key had before these columns existed), `[]` is "allow nothing".
   */
  allowed_provider_ids: string | null;
  allowed_models: string | null;
  allowed_combo_ids: string | null;
  /** Cumulative token cap; NULL = unlimited, mirroring provider_accounts. */
  token_limit: number | null;
  tokens_used: number;
  request_count: number;
  usage_reset_at: string | null;
}

export interface ProviderRow {
  id: string;
  name: string;
  transport: ProviderTransport;
  base_url: string;
  is_builtin: number;
  prefix: string;
  /** JSON-encoded per-status retry rules, or NULL for the global defaults. */
  retry_config: string | null;
  created_at: string;
}

export interface ProviderAccountRow {
  id: string;
  provider_id: string;
  label: string;
  status: "active" | "error" | "expired";
  /**
   * Operator's manual on/off switch (1 = enabled).
   *
   * Deliberately separate from `status`, which the error-recovery cycle owns
   * and resets to 'active' on the next success.
   */
  enabled: number;
  /** Failover position within the provider, lowest first. */
  sort_order: number;
  credential_enc: string;
  quota_limit_tokens: number | null;
  last_used_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  cooldown_until: string | null;
  backoff_level: number;
  created_at: string;
}

export interface QuotaStateRow {
  account_id: string;
  tokens_used: number;
  request_count: number;
}

export interface ComboRow {
  id: string;
  name: string;
  strategy: "fallback" | "round_robin";
  round_robin_cursor: number;
  created_at: string;
}

export interface ComboMemberRow {
  id: string;
  combo_id: string;
  provider_account_id: string;
  model_name: string;
  priority: number;
  input_cost_per_1m: number | null;
  output_cost_per_1m: number | null;
}

export type RequestLogType = "request" | "success" | "error" | "admin";
export type RequestLogSource = "router" | "test" | "admin";

export interface RequestLogRow {
  id: string;
  timestamp: string;
  type: RequestLogType;
  source: RequestLogSource;
  provider_account_id: string | null;
  combo_id: string | null;
  model: string | null;
  source_format: string | null;
  stream: number;
  message: string | null;
  latency_ms: number | null;
  request_id: string | null;
  retries: number;
}

export interface UsageRecordRow {
  id: string;
  timestamp: string;
  provider_account_id: string;
  combo_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  status: "success" | "error";
  latency_ms: number;
  estimated_cost: number;
  request_body: string | null;
  response_body: string | null;
  request_id: string | null;
}

export type ProviderTransport =
  | "openai"
  | "anthropic"
  | "gemini"
  | "kiro"
  | "command-code"
  | "mimo"
  | "qoder";
export type AccountStatus = "active" | "error" | "expired";
export type ComboStrategy = "fallback" | "round_robin";

export interface ProviderModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  model_name: string;
  context_length: number | null;
  max_output_tokens: number | null;
  enabled: number;
  created_at: string;
}
