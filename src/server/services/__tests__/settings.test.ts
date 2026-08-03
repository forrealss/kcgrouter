import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDb, get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { hashPassword } from "../crypto.service";
import {
  changePassword,
  createApiKey,
  getTheme,
  getTokenSaverDefault,
  listApiKeys,
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
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)",
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

  afterAll(() => {
    closeDb();
  });

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
      await expect(changePassword("wrong-password", "new-pw")).rejects.toThrow(
        "Current password is incorrect",
      );
    });

    test("Property 42c: password actually changes after successful call", async () => {
      const newPw = "changed-pw-789";
      await changePassword(INITIAL_PW, newPw);

      // Old password should no longer work
      await expect(changePassword(INITIAL_PW, "another")).rejects.toThrow();

      // New password should work
      await changePassword(newPw, INITIAL_PW);
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

    test("revokeApiKey throws on already revoked key", async () => {
      const { id } = await createApiKey("double-revoke");
      await revokeApiKey(id);
      await expect(revokeApiKey(id)).rejects.toThrow("API key already revoked");
    });

    test("Property 44c: multiple keys are unique", async () => {
      const keys = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const { plaintextKey } = await createApiKey(`unique-${i}`);
        expect(keys.has(plaintextKey)).toBe(false);
        keys.add(plaintextKey);
      }
    });
  });
});
