export const id = 15;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Account-level cooldown/backoff for provider connection errors
  -- cooldown_until is an ISO timestamp (the router skips the account while it
  --   lies in the future, so the account auto-recovers once it expires)
  -- backoff_level is the exponential-backoff level for repeated rate limits
  ALTER TABLE provider_accounts ADD COLUMN cooldown_until TEXT;
  ALTER TABLE provider_accounts ADD COLUMN backoff_level INTEGER NOT NULL DEFAULT 0;
`;
