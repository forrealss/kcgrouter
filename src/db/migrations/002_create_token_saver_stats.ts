export const id = 2;

export const sql = `
  CREATE TABLE IF NOT EXISTS token_saver_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_tokens_saved INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`;
