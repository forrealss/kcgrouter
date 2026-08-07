import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  decrypt,
  encrypt,
  generateApiKey,
  hashApiKey,
  hashPassword,
  verifyApiKeyHash,
  verifyPassword,
} from "../crypto.service";

describe("CryptoService", () => {
  beforeAll(() => {
    runMigrations();
    const settings = get("SELECT * FROM app_settings WHERE id = 1");
    if (!settings) {
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

  afterAll(() => {});

  test("Property 16a: round-trip encrypt/decrypt always returns identical plaintext", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10000 }),
        (plaintext) => {
          const ciphertext = encrypt(plaintext);
          const decrypted = decrypt(ciphertext);
          expect(decrypted).toBe(plaintext);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("Property 16b: ciphertext is never equal to plaintext", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (plaintext) => {
        const ciphertext = encrypt(plaintext);
        expect(ciphertext).not.toBe(plaintext);
      }),
      { numRuns: 100 },
    );
  });

  test("Property 16c: same plaintext encrypts to different ciphertext (random IV)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (plaintext) => {
        const enc1 = encrypt(plaintext);
        const enc2 = encrypt(plaintext);
        expect(enc1).not.toBe(enc2);
      }),
      { numRuns: 50 },
    );
  });

  test("Property 43: password hash is never equal to plaintext", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (password) => {
          const hash = await hashPassword(password);
          expect(hash).not.toBe(password);
        },
      ),
      { numRuns: 50 },
    );
  });

  test("Property: password verify returns true only for matching password", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (password) => {
          const hash = await hashPassword(password);
          expect(await verifyPassword(password, hash)).toBe(true);
          expect(
            await verifyPassword(`definitely-wrong-${password}`, hash),
          ).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  test("Property: api key hash round-trip works", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (key) => {
          const hash = await hashApiKey(key);
          expect(await verifyApiKeyHash(key, hash)).toBe(true);
          expect(await verifyApiKeyHash(`wrong-${key}`, hash)).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  test("Property: generateApiKey always starts with kcg_ and has unique values", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const key = generateApiKey();
      expect(key).toMatch(/^kcg_[a-f0-9]{64}$/);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });
});
