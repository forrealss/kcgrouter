export const id = 23;

export const sql = `
  -- Recreate providers table with 'antigravity' added to transport CHECK constraint
  CREATE TABLE IF NOT EXISTS providers_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL CHECK (transport IN ('openai', 'anthropic', 'gemini', 'kiro', 'command-code', 'mimo', 'qoder', 'antigravity')),
    base_url TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    prefix TEXT NOT NULL DEFAULT '',
    retry_config TEXT,
    created_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO providers_new (id, name, transport, base_url, is_builtin, prefix, retry_config, created_at)
    SELECT id, name, transport, base_url, is_builtin, prefix, retry_config, created_at FROM providers;
  DROP TABLE providers;
  ALTER TABLE providers_new RENAME TO providers;

  -- Seed the builtin Antigravity provider (the seeder also runs, but only
  -- INSERT OR IGNORE — this keeps upgrades and fresh installs identical)
  INSERT OR IGNORE INTO providers (id, name, transport, base_url, is_builtin, prefix, created_at)
    VALUES ('builtin-antigravity', 'Google Antigravity', 'antigravity', 'https://daily-cloudcode-pa.googleapis.com', 1, 'antigravity', datetime('now'));
`;
