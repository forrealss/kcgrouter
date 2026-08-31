import {
  isDefaultPasswordHintEnabled,
  setDefaultPasswordHintEnabled,
} from "../../config";
import {
  clientKey,
  loginRateLimiter,
  MAX_ATTEMPTS,
} from "../middleware/login-rate-limit.middleware";
import {
  clearSessionCookieHeaders,
  login,
  setSessionCookieHeaders,
} from "../services/session.service";
import {
  changePassword,
  isUsingDefaultPassword,
} from "../services/settings.service";
import type { RouteHandler } from "./types";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

export const authRoutes: Record<string, RouteHandler> = {
  "GET /api/auth/session": async () => {
    // Reached only with a valid session cookie — the /api/* middleware
    // short-circuits with 401 before this handler otherwise. Used by the
    // frontend to distinguish authenticated vs unauthenticated, now that the
    // theme endpoint is public.
    //
    // `mustChangePassword` drives the forced-change dialog: while it is true
    // the server also rejects every other /api/* route, so the client has no
    // useful state to render until the password is rotated.
    return new Response(
      JSON.stringify({
        ok: true,
        mustChangePassword: await isUsingDefaultPassword(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  "POST /api/auth/login": async (req, _params, context) => {
    const key = clientKey(context?.clientAddress);

    // Checked before reading the body so a blocked client costs nothing.
    const limit = loginRateLimiter.check(key);
    if (!limit.allowed) {
      return json(
        {
          error: `Too many failed attempts. Try again in ${limit.retryAfterSeconds}s.`,
          code: "rate_limited",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    let body: { password?: string };
    try {
      body = (await req.json()) as { password?: string };
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // A malformed request is not a guess, so it does not count against the
    // limit — only an actual wrong password does.
    if (!body.password) {
      return json({ error: "Password required" }, { status: 400 });
    }

    const result = await login(body.password);
    if (!result) {
      loginRateLimiter.recordFailure(key);
      const after = loginRateLimiter.check(key);
      return json(
        {
          error: "Invalid password",
          // Surfaced so the UI can warn before the client is locked out.
          attemptsRemaining: after.remaining,
        },
        { status: 401 },
      );
    }

    loginRateLimiter.reset(key);

    return json(
      { ok: true },
      { status: 200, headers: setSessionCookieHeaders(result.cookie) },
    );
  },

  // Public: the login screen needs this before a session exists. Reveals only
  // whether the seeded default is still in use — never the password itself,
  // which the client already hardcodes for display.
  //
  // Also reports the attempt budget so the form can state the real limit
  // instead of duplicating the number and drifting from the server.
  "GET /api/auth/default-password-hint": async (_req, _params, context) => {
    const show =
      isDefaultPasswordHintEnabled() && (await isUsingDefaultPassword());
    const limit = loginRateLimiter.check(clientKey(context?.clientAddress));
    return json({
      show,
      maxAttempts: MAX_ATTEMPTS,
      // Lets a reloaded page pick the countdown back up mid-lockout.
      retryAfterSeconds: limit.allowed ? 0 : limit.retryAfterSeconds,
    });
  },

  "POST /api/auth/logout": () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...clearSessionCookieHeaders(),
      },
    });
  },

  "POST /api/auth/change-password": async (req) => {
    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!body.currentPassword || !body.newPassword) {
      return new Response(
        JSON.stringify({ error: "currentPassword and newPassword required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      await changePassword(body.currentPassword, body.newPassword);
      // The hint has done its job; persisting false keeps it off even if the
      // password is somehow reset to the default later.
      setDefaultPasswordHintEnabled(false);
      return json({ ok: true }, { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      // A wrong current password is an auth failure (401); a rejected *new*
      // password is a validation failure (400). Reporting both as 401 made the
      // client treat "too short" as "wrong credentials".
      const status = message === "Current password is incorrect" ? 401 : 400;
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
