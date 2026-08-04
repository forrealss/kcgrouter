import { get, getDb } from "./client";

interface MigrationRow {
  id: number;
  applied_at: string;
}

const migrations: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        password_hash TEXT NOT NULL,
        theme TEXT NOT NULL DEFAULT 'light',
        token_saver_default_enabled INTEGER NOT NULL DEFAULT 1,
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
    `,
  },
  {
    id: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS token_saver_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_tokens_saved INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO token_saver_stats (id, total_tokens_saved, updated_at)
      VALUES (1, 0, datetime('now'));
    `,
  },
  {
    id: 3,
    sql: `
      -- Recreate providers table with updated transport CHECK constraint + is_builtin
      CREATE TABLE IF NOT EXISTS providers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        transport TEXT NOT NULL CHECK (transport IN ('openai', 'anthropic', 'gemini', 'kiro', 'command-code')),
        base_url TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO providers_new (id, name, transport, base_url, is_builtin, created_at)
        SELECT id, name, transport, base_url, 0, created_at FROM providers;
      DROP TABLE providers;
      ALTER TABLE providers_new RENAME TO providers;
    `,
  },
  {
    id: 4,
    sql: `
      -- Seed built-in providers
      INSERT OR IGNORE INTO providers (id, name, transport, base_url, is_builtin, created_at)
      VALUES
        ('builtin-openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 1, datetime('now')),
        ('builtin-anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com', 1, datetime('now')),
        ('builtin-gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com', 1, datetime('now')),
        ('builtin-kiro', 'Kiro AI', 'kiro', 'https://codewhisperer.us-east-1.amazonaws.com', 1, datetime('now')),
        ('builtin-command-code', 'Command Code', 'command-code', 'https://api.commandcode.ai', 1, datetime('now'));
    `,
  },
  {
    id: 5,
    sql: `
      -- Add prefix column for provider/model routing
      ALTER TABLE providers ADD COLUMN prefix TEXT NOT NULL DEFAULT '';
      -- Set prefixes for built-in providers
      UPDATE providers SET prefix = 'openai' WHERE id = 'builtin-openai';
      UPDATE providers SET prefix = 'anthropic' WHERE id = 'builtin-anthropic';
      UPDATE providers SET prefix = 'gemini' WHERE id = 'builtin-gemini';
      UPDATE providers SET prefix = 'kiro' WHERE id = 'builtin-kiro';
      UPDATE providers SET prefix = 'command-code' WHERE id = 'builtin-command-code';
    `,
  },
  {
    id: 6,
    sql: `
      -- Create provider_models table
      CREATE TABLE IF NOT EXISTS provider_models (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        context_length INTEGER,
        max_output_tokens INTEGER,
        enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(provider_id, model_id)
      );

      -- Seed default models for built-in providers (disabled by default)
      INSERT OR IGNORE INTO provider_models (id, provider_id, model_id, model_name, context_length, max_output_tokens, enabled, created_at)
      SELECT 'pm-' || p.id || '-' || m.model_id, p.id, m.model_id, m.model_name, m.context_length, m.max_output_tokens, 0, datetime('now')
      FROM providers p
      CROSS JOIN (
        SELECT 'builtin-openai' as provider, 'gpt-4o' as model_id, 'GPT-4o' as model_name, 128000 as context_length, 16384 as max_output_tokens
        UNION ALL SELECT 'builtin-openai', 'gpt-4o-mini', 'GPT-4o Mini', 128000, 16384
        UNION ALL SELECT 'builtin-openai', 'gpt-4.1', 'GPT-4.1', 1048576, 32768
        UNION ALL SELECT 'builtin-openai', 'gpt-4.1-mini', 'GPT-4.1 Mini', 1048576, 32768
        UNION ALL SELECT 'builtin-openai', 'gpt-4.1-nano', 'GPT-4.1 Nano', 1048576, 32768
        UNION ALL SELECT 'builtin-openai', 'o3', 'o3', 200000, 100000
        UNION ALL SELECT 'builtin-openai', 'o3-mini', 'o3-mini', 200000, 100000
        UNION ALL SELECT 'builtin-openai', 'o4-mini', 'o4-mini', 200000, 100000
        UNION ALL SELECT 'builtin-anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 200000, 64000
        UNION ALL SELECT 'builtin-anthropic', 'claude-haiku-4-20250514', 'Claude Haiku 4', 200000, 64000
        UNION ALL SELECT 'builtin-anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 200000, 8192
        UNION ALL SELECT 'builtin-anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 200000, 8192
        UNION ALL SELECT 'builtin-gemini', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1048576, 65536
        UNION ALL SELECT 'builtin-gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1048576, 65536
        UNION ALL SELECT 'builtin-gemini', 'gemini-2.0-flash', 'Gemini 2.0 Flash', 1048576, 8192
        UNION ALL SELECT 'builtin-gemini', 'gemini-1.5-pro', 'Gemini 1.5 Pro', 2097152, 8192
        UNION ALL SELECT 'builtin-gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', 1048576, 8192
        UNION ALL SELECT 'builtin-kiro', 'claude-sonnet-5', 'Claude Sonnet 5', 1000000, 128000
        UNION ALL SELECT 'builtin-kiro', 'claude-sonnet-4.5', 'Claude Sonnet 4.5', 200000, 64000
        UNION ALL SELECT 'builtin-kiro', 'claude-haiku-4.5', 'Claude Haiku 4.5', 200000, 64000
        UNION ALL SELECT 'builtin-kiro', 'deepseek-3.2', 'DeepSeek V3.2', 200000, 64000
        UNION ALL SELECT 'builtin-kiro', 'minimax-m2.5', 'MiniMax M2.5', 200000, 64000
        UNION ALL SELECT 'builtin-kiro', 'glm-5', 'GLM-5', 200000, 64000
        UNION ALL SELECT 'builtin-kiro', 'qwen3-coder-next', 'Qwen3 Coder Next', 200000, 64000
        UNION ALL SELECT 'builtin-kiro', 'gpt-5.6-sol', 'GPT-5.6 Sol', 272000, 128000
        UNION ALL SELECT 'builtin-kiro', 'gpt-5.6-terra', 'GPT-5.6 Terra', 272000, 128000
        UNION ALL SELECT 'builtin-kiro', 'gpt-5.6-luna', 'GPT-5.6 Luna', 272000, 128000
        UNION ALL SELECT 'builtin-command-code', 'claude-opus-4-7', 'Claude Opus 4.7 (CC)', 200000, 32000
        UNION ALL SELECT 'builtin-command-code', 'gpt-5.5', 'GPT-5.5 (CC)', 256000, 128000
        UNION ALL SELECT 'builtin-command-code', 'deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro (CC)', 1000000, 131072
        UNION ALL SELECT 'builtin-command-code', 'kimi-k2.5', 'Kimi K2.5 (CC)', 256000, 65536
        UNION ALL SELECT 'builtin-command-code', 'minimax-m2.5', 'MiniMax M2.5 (CC)', 256000, 65536
        UNION ALL SELECT 'builtin-command-code', 'glm-5', 'GLM-5 (CC)', 200000, 32000
        UNION ALL SELECT 'builtin-command-code', 'qwen3-coder-next', 'Qwen3 Coder Next (CC)', 200000, 32000
      ) m
      WHERE p.id = m.provider;
    `,
  },
];

// Default password for the initial admin login. Change it after first login.
export const DEFAULT_PASSWORD = "admin";

function seedDefaultAppSettings(): void {
  const existing = get<{ id: number }>("SELECT id FROM app_settings WHERE id = 1");
  if (existing) return;

  const passwordHash = Bun.password.hashSync(DEFAULT_PASSWORD);
  const now = new Date().toISOString();
  getDb().run(
    "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, created_at, updated_at) VALUES (1, ?, 'light', 1, ?, ?)",
    passwordHash,
    now,
    now,
  );
  console.log(`Seeded default app_settings with default password "${DEFAULT_PASSWORD}"`);
}

function ensureMigrationsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

export function runMigrations(): void {
  ensureMigrationsTable();

  for (const migration of migrations) {
    const applied = get<MigrationRow>(
      "SELECT id FROM _migrations WHERE id = ?",
      migration.id,
    );
    if (!applied) {
      getDb().exec(migration.sql);
      getDb().run(
        "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
        migration.id,
        new Date().toISOString(),
      );
      console.log(`Migration ${migration.id} applied`);
    }
  }

  seedDefaultAppSettings();
}
