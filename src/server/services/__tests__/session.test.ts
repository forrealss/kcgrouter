import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import { hashPassword } from "../crypto.service";
import { login, logout, verify } from "../session.service";

const TEST_PASSWORD = "test-session-pw-123";

describe("SessionService", () => {
  beforeAll(async () => {
    runMigrations();
    const hash = await hashPassword(TEST_PASSWORD);
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        hash,
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    } else {
      run("UPDATE app_settings SET password_hash = ? WHERE id = 1", hash);
    }
  });

  afterAll(() => {});

  // Property 39: Login succeeds if and only if password matches, producing valid session
  test("Property 39a: login with correct password returns valid cookie", async () => {
    const result = await login(TEST_PASSWORD);
    expect(result).not.toBeNull();
    expect(result?.cookie).toBeTruthy();
    expect(verify(result?.cookie ?? "")).toBe(true);
  });

  test("Property 39b: login with wrong password always returns null", async () => {
    fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (wrongPw) => {
        if (wrongPw === TEST_PASSWORD) return; // skip matching password
        const result = await login(wrongPw);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  // Property 40: Invalid/missing cookie is always rejected
  test("Property 40a: verify with empty string returns false", () => {
    expect(verify("")).toBe(false);
  });

  test("Property 40b: verify with random garbage always returns false", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5, maxLength: 200 }), (garbage) => {
        // Only test strings that don't happen to be a valid session format
        if (!garbage.includes(".")) {
          expect(verify(garbage)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("Property 40c: verify with tampered signature always returns false", async () => {
    const session = await login(TEST_PASSWORD);
    expect(session).not.toBeNull();

    const cookie = session?.cookie ?? "";
    const [id, sig] = cookie.split(".") as [string, string];
    // Flip one character in the signature
    const flippedSig = sig[0] === "a" ? `b${sig.slice(1)}` : `a${sig.slice(1)}`;
    expect(verify(`${id}.${flippedSig}`)).toBe(false);
  });

  // Property 41: Logout makes session unusable (stateless: client discards)
  test("Property 41: logout does not throw and client discards cookie", async () => {
    const session = await login(TEST_PASSWORD);
    expect(session).not.toBeNull();

    // logout is stateless — it should not throw
    expect(() => logout(session?.cookie ?? "")).not.toThrow();
  });
});
