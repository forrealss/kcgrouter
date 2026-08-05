export const id = 7;

export const sql = `
  -- Recreate providers table with 'mimo' added to transport CHECK constraint
  CREATE TABLE IF NOT EXISTS providers_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL CHECK (transport IN ('openai', 'anthropic', 'gemini', 'kiro', 'command-code', 'mimo')),
    base_url TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    prefix TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO providers_new (id, name, transport, base_url, is_builtin, prefix, created_at)
    SELECT id, name, transport, base_url, is_builtin, prefix, created_at FROM providers;
  DROP TABLE providers;
  ALTER TABLE providers_new RENAME TO providers;

  -- Seed builtin MiMo provider
  INSERT OR IGNORE INTO providers (id, name, transport, base_url, is_builtin, prefix, created_at)
    VALUES ('builtin-mimo', 'Xiaomi MiMo', 'mimo', 'https://api.xiaomimimo.com/v1', 1, 'mimo', datetime('now'));
`;
