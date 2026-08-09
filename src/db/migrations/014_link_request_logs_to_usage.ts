export const id = 14;

export const sql = `
  -- Correlate request lifecycle logs with their stored usage payloads
  ALTER TABLE request_logs ADD COLUMN request_id TEXT;
  ALTER TABLE usage_records ADD COLUMN request_id TEXT;

  CREATE INDEX IF NOT EXISTS idx_request_logs_request_id
    ON request_logs(request_id);
  CREATE INDEX IF NOT EXISTS idx_usage_request_id
    ON usage_records(request_id);
`;
