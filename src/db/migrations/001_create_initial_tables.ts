export const id = 1;

export const sql = `
  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    theme TEXT NOT NULL DEFAULT 'light',
    token_saver_default_enabled INTEGER NOT NULL DEFAULT 1,
    caveman_enabled INTEGER NOT NULL DEFAULT 0,
    caveman_level TEXT NOT NULL DEFAULT 'full',
    ponytail_enabled INTEGER NOT NULL DEFAULT 0,
    ponytail_level TEXT NOT NULL DEFAULT 'full',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL CHECK (transport IN ('openai', 'anthropic', 'gemini')),
    base_url TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS provider_accounts (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'expired')),
    credential_enc TEXT NOT NULL,
    quota_reset_type TEXT NOT NULL DEFAULT 'none' CHECK (quota_reset_type IN ('5h', 'daily', 'weekly', 'none')),
    quota_limit_tokens INTEGER,
    last_used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quota_state (
    account_id TEXT PRIMARY KEY REFERENCES provider_accounts(id) ON DELETE CASCADE,
    window_type TEXT NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS combos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    strategy TEXT NOT NULL CHECK (strategy IN ('fallback', 'round_robin')),
    round_robin_cursor INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS combo_members (
    id TEXT PRIMARY KEY,
    combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
    provider_account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    priority INTEGER NOT NULL,
    input_cost_per_1m REAL,
    output_cost_per_1m REAL
  );

  CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    provider_account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    combo_id TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error')),
    latency_ms INTEGER NOT NULL,
    estimated_cost REAL NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);
  CREATE INDEX IF NOT EXISTS idx_usage_account ON usage_records(provider_account_id);
`;
