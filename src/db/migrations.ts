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
