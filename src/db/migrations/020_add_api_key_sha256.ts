export const id = 20;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Fast-path lookup for API key auth.
  --
  -- key_hash is argon2id, which costs ~190ms per comparison even on a miss.
  -- verifyApiKey had to scan every row, so authenticating one proxy request
  -- cost ~190ms x (number of keys) of pure CPU -- seconds per request once a
  -- handful of keys existed.
  --
  -- A plain SHA-256 is the right primitive here: these keys are 32 random
  -- bytes (see generateApiKey), so there is nothing to brute-force and the
  -- slow KDF buys no security. Indexing the digest turns auth into one lookup.
  --
  -- Nullable because keys predating migration 009 have no key_enc to derive it
  -- from, so they keep falling back to the argon2 comparison
  ALTER TABLE api_keys ADD COLUMN key_sha256 TEXT;

  -- UNIQUE doubles as the integrity guarantee: two rows can never claim the
  -- same secret. Partial so the legacy NULL rows do not collide with each other
  CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_sha256
    ON api_keys(key_sha256) WHERE key_sha256 IS NOT NULL;
`;
