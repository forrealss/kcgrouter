export interface AppSettingsRow {
  id: 1;
  password_hash: string;
  theme: "light" | "dark";
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
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ProviderRow {
  id: string;
  name: string;
  transport: ProviderTransport;
  base_url: string;
  is_builtin: number;
  prefix: string;
  created_at: string;
}

export interface ProviderAccountRow {
  id: string;
  provider_id: string;
  label: string;
  status: "active" | "error" | "expired";
  credential_enc: string;
  quota_reset_type: "5h" | "daily" | "weekly" | "none";
  quota_limit_tokens: number | null;
  last_used_at: string | null;
  created_at: string;
}

export interface QuotaStateRow {
  account_id: string;
  window_type: "5h" | "daily" | "weekly" | "none";
  window_start: string;
  window_end: string | null;
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
}

export type ProviderTransport =
  | "openai"
  | "anthropic"
  | "gemini"
  | "kiro"
  | "command-code"
  | "mimo";
export type QuotaResetType = "5h" | "daily" | "weekly" | "none";
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
