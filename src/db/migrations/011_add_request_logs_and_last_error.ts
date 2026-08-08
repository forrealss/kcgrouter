export const id = 11;

export const sql = `
  -- Activity log for router traffic, provider tests, and admin actions
  CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    provider_account_id TEXT REFERENCES provider_accounts(id) ON DELETE SET NULL,
    combo_id TEXT,
    model TEXT,
    source_format TEXT,
    stream INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    latency_ms INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);

  -- Track the last upstream error per account so the UI can surface it
  ALTER TABLE provider_accounts ADD COLUMN last_error TEXT;
  ALTER TABLE provider_accounts ADD COLUMN last_error_at TEXT;
`;
