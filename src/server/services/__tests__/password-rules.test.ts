import { describe, expect, test } from "bun:test";
import { DEFAULT_PASSWORD as SEEDER_DEFAULT } from "../../../db/seeders/002_seed_default_app_settings";
import {
  DEFAULT_PASSWORD,
  MIN_PASSWORD_LENGTH,
} from "../../../lib/password-strength";
import {
  isUsingDefaultPassword,
  MIN_PASSWORD_LENGTH as SERVICE_MIN,
} from "../settings.service";

/**
 * The dialog's strength meter and the server's validation must agree. If these
 * drift, the UI can show a green checklist for a password the server rejects
 * (or vice versa), which is exactly the confusing failure this guards against.
 */
describe("password rule constants are shared, not copied", () => {
  test("the service re-exports the shared minimum length", () => {
    expect(SERVICE_MIN).toBe(MIN_PASSWORD_LENGTH);
  });

  test("the seeder re-exports the shared default password", () => {
    expect(SEEDER_DEFAULT).toBe(DEFAULT_PASSWORD);
  });

  test("the default password would itself fail the length rule", () => {
    // Documents why the default check runs first in assertPasswordAcceptable:
    // otherwise the generic length error masks the specific one.
    expect(DEFAULT_PASSWORD.length).toBeLessThan(MIN_PASSWORD_LENGTH);
  });

  test("the detection helper is exported for the session route", () => {
    expect(typeof isUsingDefaultPassword).toBe("function");
  });
});
