import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { DEFAULT_PASSWORD } from "../../../db/seeders/002_seed_default_app_settings";
import { hashPassword } from "../crypto.service";
import {
  changePassword,
  createApiKey,
  getDecryptedApiKey,
  getTheme,
  getTokenSaverDefault,
  getTokenSaverStats,
  isUsingDefaultPassword,
  listApiKeys,
  MIN_PASSWORD_LENGTH,
  recordTokenSaverSavings,
  revokeApiKey,
  setPasswordHash,
  setTheme,
  setTokenSaverDefault,
  verifyApiKey,
} from "../settings.service";

const INITIAL_PW = "initial-password-123";

describe("SettingsService", () => {
  beforeAll(async () => {
    runMigrations();
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        await hashPassword(INITIAL_PW),
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    } else {
      await setPasswordHash(await hashPassword(INITIAL_PW));
    }
  });

  afterAll(() => {});

  // --- 4.2: Property 37 — Round-trip theme & token saver default ---

  describe("Theme", () => {
    test("default theme is 'light'", async () => {
      const theme = await getTheme();
      expect(theme).toBe("light");
    });

    test("Property 37a: setTheme/getTheme round-trip for 'dark'", async () => {
      await setTheme("dark");
      const theme = await getTheme();
      expect(theme).toBe("dark");
    });

    test("Property 37b: setTheme/getTheme round-trip for 'light'", async () => {
      await setTheme("light");
      const theme = await getTheme();
      expect(theme).toBe("light");
    });

    test("setTheme/getTheme round-trip for 'system'", async () => {
      await setTheme("system");
      const theme = await getTheme();
      expect(theme).toBe("system");
    });

    test("Property 37c: theme persists across multiple reads", async () => {
      await setTheme("dark");
      expect(await getTheme()).toBe("dark");
      expect(await getTheme()).toBe("dark");
      expect(await getTheme()).toBe("dark");
      await setTheme("light"); // cleanup
    });
  });

  describe("Token Saver Default", () => {
    test("default token saver is enabled (1)", async () => {
      const enabled = await getTokenSaverDefault();
      expect(enabled).toBe(true);
    });

    test("Property 37d: setTokenSaverDefault round-trip for false", async () => {
      await setTokenSaverDefault(false);
      const enabled = await getTokenSaverDefault();
      expect(enabled).toBe(false);
    });

    test("Property 37e: setTokenSaverDefault round-trip for true", async () => {
      await setTokenSaverDefault(true);
      const enabled = await getTokenSaverDefault();
      expect(enabled).toBe(true);
    });

    test("records accumulated Token Saver savings", () => {
      const before = getTokenSaverStats().totalTokensSaved;
      recordTokenSaverSavings(17);
      expect(getTokenSaverStats().totalTokensSaved).toBe(before + 17);
    });
  });

  // --- 4.3: Property 42 — changePassword ---

  describe("changePassword", () => {
    test("Property 42a: succeeds with correct current password", async () => {
      const newPw = "new-password-456";
      await changePassword(INITIAL_PW, newPw);
      const hash = await import("../../../db/client").then((db) => {
        const row = db.get<{ password_hash: string }>(
          "SELECT password_hash FROM app_settings WHERE id = 1",
        );
        return row?.password_hash ?? "";
      });
      const valid = await import("../crypto.service").then((m) =>
        m.verifyPassword(newPw, hash),
      );
      expect(valid).toBe(true);

      // Reset for next tests
      await setPasswordHash(await hashPassword(INITIAL_PW));
    });

    test("Property 42b: fails with wrong current password", async () => {
      // The candidate password is deliberately long enough to pass the
      // strength check, so this asserts the credential check and not the
      // length rule.
      await expect(
        changePassword("wrong-password", "valid-new-password"),
      ).rejects.toThrow("Current password is incorrect");
    });

    test("Property 42c: password actually changes after successful call", async () => {
      const newPw = "changed-pw-789";
      await changePassword(INITIAL_PW, newPw);

      // Old password should no longer work
      await expect(
        changePassword(INITIAL_PW, "yet-another-password"),
      ).rejects.toThrow("Current password is incorrect");

      // New password should work
      await changePassword(newPw, INITIAL_PW);
    });

    test("rejects a new password shorter than the minimum", async () => {
      await expect(changePassword(INITIAL_PW, "short")).rejects.toThrow(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    });

    test("rejects reusing the seeded default password", async () => {
      await expect(
        changePassword(INITIAL_PW, DEFAULT_PASSWORD),
      ).rejects.toThrow("cannot be the default password");
    });

    test("a rejected change leaves the current password intact", async () => {
      await expect(changePassword(INITIAL_PW, "short")).rejects.toThrow();
      // The original password must still be accepted.
      await changePassword(INITIAL_PW, INITIAL_PW);
    });
  });

  // --- Default-password detection (drives the forced-change dialog) ---

  describe("isUsingDefaultPassword", () => {
    test("false while a custom password is set", async () => {
      await setPasswordHash(await hashPassword(INITIAL_PW));
      expect(await isUsingDefaultPassword()).toBe(false);
    });

    test("true once the stored hash matches the seeded default", async () => {
      await setPasswordHash(await hashPassword(DEFAULT_PASSWORD));
      expect(await isUsingDefaultPassword()).toBe(true);

      // Restore so later suites are unaffected.
      await setPasswordHash(await hashPassword(INITIAL_PW));
    });

    test("flips to false after rotating away from the default", async () => {
      await setPasswordHash(await hashPassword(DEFAULT_PASSWORD));
      expect(await isUsingDefaultPassword()).toBe(true);

      await changePassword(DEFAULT_PASSWORD, INITIAL_PW);
      expect(await isUsingDefaultPassword()).toBe(false);
    });
  });

  // --- 4.5: Properties 44, 45 — App API Key ---

  describe("App API Key", () => {
    test("createApiKey returns plaintext starting with kcg_", async () => {
      const result = await createApiKey("test-key");
      expect(result.plaintextKey).toMatch(/^kcg_[a-f0-9]{64}$/);
      expect(result.id).toMatch(/^key_/);
    });

    test("Property 44a: created key can be verified", async () => {
      const { plaintextKey } = await createApiKey("verify-test");
      const found = await verifyApiKey(plaintextKey);
      expect(found).not.toBeNull();
    });

    test("Property 44b: plaintext key never appears in listApiKeys", async () => {
      await createApiKey("no-leak-test");
      const keys = await listApiKeys();
      for (const k of keys) {
        expect(k).not.toHaveProperty("plaintextKey");
        expect(k).not.toHaveProperty("key_hash");
      }
    });

    test("Property 45: revoked key is rejected by verifyApiKey", async () => {
      const { id, plaintextKey } = await createApiKey("revoke-test");

      // Before revoke: should be found
      const before = await verifyApiKey(plaintextKey);
      expect(before).not.toBeNull();

      // Revoke
      await revokeApiKey(id);

      // After revoke: should not be found
      const after = await verifyApiKey(plaintextKey);
      expect(after).toBeNull();
    });

    test("verifyApiKey with random garbage returns null", async () => {
      const result = await verifyApiKey("kcg_nonexistent-key-garbage-12345");
      expect(result).toBeNull();
    });

    test("revokeApiKey throws on non-existent id", async () => {
      await expect(revokeApiKey("key_nonexistent")).rejects.toThrow(
        "API key not found",
      );
    });

    test("revokeApiKey removes the key from the database", async () => {
      const { id } = await createApiKey("hard-delete-test");
      await revokeApiKey(id);

      const keys = await listApiKeys();
      expect(keys.find((k) => k.id === id)).toBeUndefined();
      expect(get("SELECT * FROM api_keys WHERE id = ?", id)).toBeFalsy();
    });

    test("revokeApiKey twice throws not found", async () => {
      const { id } = await createApiKey("double-revoke");
      await revokeApiKey(id);
      await expect(revokeApiKey(id)).rejects.toThrow("API key not found");
    });

    test("Property 44c: multiple keys are unique", async () => {
      const keys = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const { plaintextKey } = await createApiKey(`unique-${i}`);
        expect(keys.has(plaintextKey)).toBe(false);
        keys.add(plaintextKey);
      }
    });

    test("getDecryptedApiKey returns same value as createApiKey", async () => {
      const { id, plaintextKey } = await createApiKey("decrypt-test");
      const decrypted = getDecryptedApiKey(id);
      expect(decrypted).toBe(plaintextKey);
    });

    test("getDecryptedApiKey throws on non-existent id", () => {
      expect(() => getDecryptedApiKey("key_nonexistent")).toThrow(
        "API key not found",
      );
    });

    test("listApiKeys includes has_key for new keys", async () => {
      await createApiKey("has-key-test");
      const keys = await listApiKeys();
      const found = keys.find((k) => k.label === "has-key-test");
      expect(found).toBeDefined();
      expect(found?.has_key).toBe(true);
    });
  });
});
