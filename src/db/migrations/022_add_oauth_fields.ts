export const id = 22;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- OAuth accounts (antigravity) keep their long-lived secrets (refresh token,
  -- email, projectId) in an encrypted JSON blob, separate from the live access
  -- token stored in credential_enc. NULL for apikey-style accounts
  ALTER TABLE provider_accounts ADD COLUMN oauth_enc TEXT;

  -- ISO timestamp of when the access token inside credential_enc expires
  ALTER TABLE provider_accounts ADD COLUMN oauth_expires_at TEXT;
`;
