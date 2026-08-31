import { isUsingDefaultPassword } from "../services/settings.service";

/**
 * Routes still reachable while the seeded default password is in place: the
 * session probe (so the client can learn it must prompt), the password change
 * itself, logout, and the theme read used by the login screen.
 */
const EXEMPT_ROUTES = new Set([
  "GET /api/auth/session",
  "POST /api/auth/change-password",
  "POST /api/auth/logout",
  "GET /api/settings/theme",
]);

/** True when this route stays available during a forced password change. */
export function isPasswordChangeExempt(
  method: string,
  pathname: string,
): boolean {
  return EXEMPT_ROUTES.has(`${method} ${pathname}`);
}

/**
 * Block authenticated API access while the dashboard still uses the default
 * password.
 *
 * The forced-change dialog in the UI is only a prompt — a client can dismiss
 * it or skip the UI entirely and call the API directly. This gate is what
 * actually prevents reaching stored provider credentials before the password
 * is rotated, which matters because the gateway listens on every interface.
 *
 * Returns `{ ok: true }` when the request may proceed.
 */
export async function enforcePasswordChange(
  method: string,
  pathname: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (isPasswordChangeExempt(method, pathname)) return { ok: true };
  if (!(await isUsingDefaultPassword())) return { ok: true };

  return {
    ok: false,
    response: Response.json(
      {
        error: "Set a new dashboard password before using KCG Router.",
        code: "password_change_required",
      },
      { status: 403 },
    ),
  };
}
