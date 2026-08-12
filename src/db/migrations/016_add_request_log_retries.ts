export const id = 16;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Number of in-place retries fetchWithRetry performed before this entry
  --   (0 = first attempt succeeded or failed without any retry)
  ALTER TABLE request_logs ADD COLUMN retries INTEGER NOT NULL DEFAULT 0;
`;
