/**
 * Derive `api_keys.key_sha256` for rows that predate migration 020.
 *
 * The digest cannot be computed in SQL, and the plaintext is recoverable only
 * by decrypting `key_enc`, so the backfill lives here rather than in the
 * migration. Running as a seeder also means keys created while an older build
 * was in use get picked up on the next start.
 *
 * Keys from before migration 009 have no `key_enc` at all; those keep their
 * NULL digest and continue to authenticate through the argon2 fallback.
 */

import { decrypt, sha256ApiKey } from "../../server/services/crypto.service";
import { query, run } from "../client";

export function seed(): void {
  const pending = query<{ id: string; key_enc: string }>(
    `SELECT id, key_enc FROM api_keys
     WHERE key_sha256 IS NULL AND key_enc IS NOT NULL`,
  );
  if (pending.length === 0) return;

  let filled = 0;
  let failed = 0;

  for (const row of pending) {
    // A wrong ENCRYPTION_KEY makes decrypt throw. That is a misconfiguration
    // the encryption-health check already reports, and it must not abort
    // startup — leave the digest NULL so the key still works via argon2.
    try {
      run(
        "UPDATE api_keys SET key_sha256 = ? WHERE id = ?",
        sha256ApiKey(decrypt(row.key_enc)),
        row.id,
      );
      filled += 1;
    } catch {
      failed += 1;
    }
  }

  if (filled > 0) {
    console.log(`Backfilled fast-path digest for ${filled} API key(s)`);
  }
  if (failed > 0) {
    console.warn(
      `${failed} API key(s) could not be decrypted for digest backfill — they will use the slow verification path. Check ENCRYPTION_KEY.`,
    );
  }
}
