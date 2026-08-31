export const id = 19;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Per-key scoping. NULL means unrestricted, which is what every existing key
  -- gets on upgrade -- the previous behaviour was full access, so a NULL has to
  -- keep meaning "allow everything" or this migration would lock people out.
  -- An empty JSON array is different from NULL and means "allow nothing"
  ALTER TABLE api_keys ADD COLUMN allowed_provider_ids TEXT;
  ALTER TABLE api_keys ADD COLUMN allowed_models TEXT;
  ALTER TABLE api_keys ADD COLUMN allowed_combo_ids TEXT;

  -- Cumulative token cap, mirroring provider_accounts.quota_limit_tokens:
  -- NULL = unlimited. Tokens are only known after a response completes, so the
  -- cap is enforced on the following request rather than mid-flight
  ALTER TABLE api_keys ADD COLUMN token_limit INTEGER;
  ALTER TABLE api_keys ADD COLUMN tokens_used INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE api_keys ADD COLUMN request_count INTEGER NOT NULL DEFAULT 0;

  -- Set when an operator resets the counter, so the UI can say what the
  -- current total is measured from
  ALTER TABLE api_keys ADD COLUMN usage_reset_at TEXT;
`;
