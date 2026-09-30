export const id = 25;

// WebAuthn passkeys for dashboard login. Only public keys are stored — nothing
// here is secret. `rp_id`/`origin` pin each credential to the host it was
// registered on (the dashboard may sit behind a reverse proxy, so the server
// cannot infer its public origin on its own).
export const sql = `
  CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    name TEXT NOT NULL,
    rp_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    device_type TEXT,
    backed_up INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_rp_id
    ON webauthn_credentials (rp_id);
`;
