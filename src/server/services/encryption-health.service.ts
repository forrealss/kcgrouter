import { query } from "../../db/client";
import { decrypt } from "./crypto.service";

export interface EncryptionHealthReport {
  /** True when stored credentials exist but the current key cannot decrypt all of them. */
  mismatch: boolean;
  /** Total encrypted values probed. */
  checked: number;
  /** Values the current key failed to decrypt. */
  undecryptable: number;
  accounts: {
    checked: number;
    undecryptable: number;
  };
  apiKeys: {
    checked: number;
    undecryptable: number;
  };
}

// Probing every credential is cheap (a handful of rows per account/API key)
// and gives an exact picture. Cap defensively anyway so a huge database can
// never turn this into a slow request. Note the counts only cover the probed
// window — a mismatch beyond the first MAX_PROBES rows would go undetected.
const MAX_PROBES = 200;

function countUndecryptable(values: string[]): number {
  let failed = 0;
  for (const value of values) {
    try {
      decrypt(value);
    } catch {
      failed += 1;
    }
  }
  return failed;
}

/**
 * Detect whether the currently configured ENCRYPTION_KEY can decrypt the
 * credentials stored in the database.
 *
 * A mismatch happens when credentials were created under a different key
 * (e.g. dev server using the project `.env` while the production daemon uses
 * `~/.kcgrouter/.env`). Decrypting with the wrong key throws, which is exactly
 * what surfaced as HTTP 500 on the connection-test endpoints.
 */
export function checkEncryptionHealth(): EncryptionHealthReport {
  const accounts = query<{ credential_enc: string }>(
    "SELECT credential_enc FROM provider_accounts LIMIT ?",
    MAX_PROBES,
  );
  const apiKeys = query<{ key_enc: string | null }>(
    "SELECT key_enc FROM api_keys WHERE key_enc IS NOT NULL AND key_enc != '' LIMIT ?",
    MAX_PROBES,
  );

  const accountValues = accounts.map((a) => a.credential_enc);
  const apiKeyValues = apiKeys.map((k) => k.key_enc ?? "");

  const accountsUndecryptable = countUndecryptable(accountValues);
  const apiKeysUndecryptable = countUndecryptable(apiKeyValues);

  const checked = accountValues.length + apiKeyValues.length;
  const undecryptable = accountsUndecryptable + apiKeysUndecryptable;

  return {
    mismatch: checked > 0 && undecryptable > 0,
    checked,
    undecryptable,
    accounts: {
      checked: accountValues.length,
      undecryptable: accountsUndecryptable,
    },
    apiKeys: {
      checked: apiKeyValues.length,
      undecryptable: apiKeysUndecryptable,
    },
  };
}
