export const id = 5;

export const sql = `
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
`;
