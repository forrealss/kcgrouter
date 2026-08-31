import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { seed as backfillDigests } from "../../../db/seeders/005_backfill_api_key_sha256";
import { hashApiKey, sha256ApiKey } from "../crypto.service";
import {
  createApiKey,
  getDecryptedApiKey,
  verifyApiKey,
} from "../settings.service";

/**
 * Insert a key the way builds before migration 020 did: an argon2 hash and no
 * digest. Used to prove the fallback path still authenticates.
 */
async function insertLegacyKey(
  plaintext: string,
  opts: { withEnc?: boolean } = {},
): Promise<string> {
  const id = `key_legacy_${Math.random().toString(36).slice(2, 10)}`;
  const { encrypt } = await import("../crypto.service");
  run(
    "INSERT INTO api_keys (id, label, key_hash, key_enc, key_sha256, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    id,
    `legacy-${id}`,
    await hashApiKey(plaintext),
    opts.withEnc === false ? null : encrypt(plaintext),
    new Date().toISOString(),
  );
  return id;
}

function digestOf(id: string): string | null {
  return (
    get<{ key_sha256: string | null }>(
      "SELECT key_sha256 FROM api_keys WHERE id = ?",
      id,
    )?.key_sha256 ?? null
  );
}

describe("API key verification", () => {
  beforeAll(() => {
    runMigrations();
    if (!get("SELECT * FROM app_settings WHERE id = 1")) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  });

  describe("fast path", () => {
    test("a new key stores an indexed digest at creation", async () => {
      const { id, plaintextKey } = await createApiKey(`fast-${Date.now()}`);

      expect(digestOf(id)).toBe(sha256ApiKey(plaintextKey));
    });

    test("verifies via the digest and returns the row", async () => {
      const { id, plaintextKey } = await createApiKey(`verify-${Date.now()}`);

      const row = await verifyApiKey(plaintextKey);
      expect(row?.id).toBe(id);
    });

    test("records last_used_at", async () => {
      const { id, plaintextKey } = await createApiKey(`used-${Date.now()}`);
      expect(
        get<{ last_used_at: string | null }>(
          "SELECT last_used_at FROM api_keys WHERE id = ?",
          id,
        )?.last_used_at,
      ).toBeNull();

      await verifyApiKey(plaintextKey);

      expect(
        get<{ last_used_at: string | null }>(
          "SELECT last_used_at FROM api_keys WHERE id = ?",
          id,
        )?.last_used_at,
      ).not.toBeNull();
    });

    test("rejects an unknown key", async () => {
      expect(await verifyApiKey("kcg_not_a_real_key")).toBeNull();
    });

    test("rejects a revoked key", async () => {
      const { id, plaintextKey } = await createApiKey(`revoked-${Date.now()}`);
      run("DELETE FROM api_keys WHERE id = ?", id);

      expect(await verifyApiKey(plaintextKey)).toBeNull();
    });

    test("one key's secret does not authenticate another", async () => {
      const a = await createApiKey(`pair-a-${Date.now()}`);
      const b = await createApiKey(`pair-b-${Date.now()}`);

      expect((await verifyApiKey(a.plaintextKey))?.id).toBe(a.id);
      expect((await verifyApiKey(b.plaintextKey))?.id).toBe(b.id);
    });
  });

  describe("legacy fallback", () => {
    test("authenticates a key that has no digest", async () => {
      const plaintext = `kcg_legacy_${Math.random().toString(36).slice(2)}`;
      const id = await insertLegacyKey(plaintext);

      const row = await verifyApiKey(plaintext);
      expect(row?.id).toBe(id);
    });

    test("promotes the row so the next call takes the fast path", async () => {
      const plaintext = `kcg_promote_${Math.random().toString(36).slice(2)}`;
      const id = await insertLegacyKey(plaintext);
      expect(digestOf(id)).toBeNull();

      await verifyApiKey(plaintext);

      expect(digestOf(id)).toBe(sha256ApiKey(plaintext));
      // And it still resolves once promoted.
      expect((await verifyApiKey(plaintext))?.id).toBe(id);
    });

    test("a wrong key is still rejected when legacy rows exist", async () => {
      const plaintext = `kcg_legacy2_${Math.random().toString(36).slice(2)}`;
      await insertLegacyKey(plaintext);

      expect(await verifyApiKey("kcg_wrong_value")).toBeNull();
    });
  });

  describe("digest backfill", () => {
    test("fills the digest for keys that still have key_enc", async () => {
      const plaintext = `kcg_backfill_${Math.random().toString(36).slice(2)}`;
      const id = await insertLegacyKey(plaintext);
      expect(digestOf(id)).toBeNull();

      backfillDigests();

      expect(digestOf(id)).toBe(sha256ApiKey(plaintext));
    });

    test("is idempotent", async () => {
      const plaintext = `kcg_idem_${Math.random().toString(36).slice(2)}`;
      const id = await insertLegacyKey(plaintext);

      backfillDigests();
      const first = digestOf(id);
      backfillDigests();

      expect(digestOf(id)).toBe(first);
    });

    test("leaves pre-encryption keys alone rather than failing", async () => {
      const plaintext = `kcg_noenc_${Math.random().toString(36).slice(2)}`;
      const id = await insertLegacyKey(plaintext, { withEnc: false });

      // No key_enc means no recoverable plaintext, so the digest stays NULL and
      // the key keeps working through the argon2 comparison.
      expect(() => backfillDigests()).not.toThrow();
      expect(digestOf(id)).toBeNull();
      expect((await verifyApiKey(plaintext))?.id).toBe(id);
    });

    test("backfilled keys remain readable through getDecryptedApiKey", async () => {
      const plaintext = `kcg_read_${Math.random().toString(36).slice(2)}`;
      const id = await insertLegacyKey(plaintext);

      backfillDigests();

      expect(getDecryptedApiKey(id)).toBe(plaintext);
    });
  });

  describe("digest uniqueness", () => {
    test("the same secret cannot be stored twice", async () => {
      const plaintext = `kcg_dupe_${Math.random().toString(36).slice(2)}`;
      await insertLegacyKey(plaintext);
      backfillDigests();

      // The partial unique index is the integrity guarantee behind the
      // single-row lookup: without it a duplicate digest would make auth
      // ambiguous.
      expect(() =>
        run(
          "INSERT INTO api_keys (id, label, key_hash, key_enc, key_sha256, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
          `key_dupe_${Math.random().toString(36).slice(2, 8)}`,
          "dupe",
          "x",
          sha256ApiKey(plaintext),
          new Date().toISOString(),
        ),
      ).toThrow();
    });

    test("multiple legacy rows with NULL digests coexist", async () => {
      // A plain UNIQUE index would treat these as colliding in some engines;
      // the index is partial precisely so legacy rows are exempt.
      const a = `kcg_null_a_${Math.random().toString(36).slice(2)}`;
      const b = `kcg_null_b_${Math.random().toString(36).slice(2)}`;

      const idA = await insertLegacyKey(a, { withEnc: false });
      const idB = await insertLegacyKey(b, { withEnc: false });

      expect(digestOf(idA)).toBeNull();
      expect(digestOf(idB)).toBeNull();
    });
  });
});
