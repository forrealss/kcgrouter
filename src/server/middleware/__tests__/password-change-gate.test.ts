import { beforeAll, describe, expect, test } from "bun:test";
import { runMigrations } from "../../../db/migrations";
import { DEFAULT_PASSWORD } from "../../../db/seeders/002_seed_default_app_settings";
import { hashPassword } from "../../services/crypto.service";
import { setPasswordHash } from "../../services/settings.service";
import {
  enforcePasswordChange,
  isPasswordChangeExempt,
} from "../password-change-gate.middleware";

const CUSTOM_PW = "a-properly-set-password";

async function useDefaultPassword(): Promise<void> {
  await setPasswordHash(await hashPassword(DEFAULT_PASSWORD));
}

async function useCustomPassword(): Promise<void> {
  await setPasswordHash(await hashPassword(CUSTOM_PW));
}

beforeAll(() => {
  runMigrations();
});

describe("password change gate", () => {
  describe("exempt routes", () => {
    test("allows the routes needed to observe and fix the state", () => {
      expect(isPasswordChangeExempt("GET", "/api/auth/session")).toBe(true);
      expect(isPasswordChangeExempt("POST", "/api/auth/change-password")).toBe(
        true,
      );
      expect(isPasswordChangeExempt("POST", "/api/auth/logout")).toBe(true);
      expect(isPasswordChangeExempt("GET", "/api/settings/theme")).toBe(true);
    });

    test("does not exempt credential-bearing routes", () => {
      expect(isPasswordChangeExempt("GET", "/api/providers")).toBe(false);
      expect(isPasswordChangeExempt("GET", "/api/settings/api-keys")).toBe(
        false,
      );
    });

    test("is method-specific", () => {
      // PATCH /api/settings/theme writes, so it must not inherit the read
      // exemption.
      expect(isPasswordChangeExempt("PATCH", "/api/settings/theme")).toBe(
        false,
      );
    });
  });

  describe("while the default password is in place", () => {
    test("blocks provider listing with 403 and a machine-readable code", async () => {
      await useDefaultPassword();

      const result = await enforcePasswordChange("GET", "/api/providers");
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected the gate to block");

      expect(result.response.status).toBe(403);
      const body = (await result.response.json()) as {
        code?: string;
      };
      expect(body.code).toBe("password_change_required");
    });

    test("blocks reading a stored router API key", async () => {
      await useDefaultPassword();

      const result = await enforcePasswordChange(
        "GET",
        "/api/settings/api-keys/key_abc/key",
      );
      expect(result.ok).toBe(false);
    });

    test("still allows the password change itself", async () => {
      await useDefaultPassword();

      const result = await enforcePasswordChange(
        "POST",
        "/api/auth/change-password",
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("once a custom password is set", () => {
    test("lets previously blocked routes through", async () => {
      await useCustomPassword();

      expect((await enforcePasswordChange("GET", "/api/providers")).ok).toBe(
        true,
      );
      expect(
        (await enforcePasswordChange("GET", "/api/settings/api-keys")).ok,
      ).toBe(true);
    });
  });
});
