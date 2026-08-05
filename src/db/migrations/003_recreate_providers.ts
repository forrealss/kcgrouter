export const id = 3;

export const sql = `
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
`;
