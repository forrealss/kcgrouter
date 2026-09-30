export const id = 24;

// Durable fallback for Gemini/Antigravity thought signatures. The in-memory
// cache remains the hot path; these rows survive a daemon restart for up to
// seven days and are pruned by the provider cache.
export const sql = `
  CREATE TABLE IF NOT EXISTS gemini_thought_signatures (
    key TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gemini_thought_signatures_expires
    ON gemini_thought_signatures (expires_at);
`;
