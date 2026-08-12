export const id = 17;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Per-provider retry policy (JSON, e.g. {"502":{"attempts":2,"delayMs":500}})
  -- NULL = use the global DEFAULT_RETRY_CONFIG in src/server/providers/retry.ts
  ALTER TABLE providers ADD COLUMN retry_config TEXT;
`;
