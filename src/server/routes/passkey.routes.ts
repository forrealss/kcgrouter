import {
  clientKey,
  loginRateLimiter,
} from "../middleware/login-rate-limit.middleware";
import {
  deletePasskey,
  finishAuthentication,
  finishRegistration,
  hasPasskeys,
  listPasskeys,
  PasskeyError,
  relyingPartyFromRequest,
  renamePasskey,
  startAuthentication,
  startRegistration,
} from "../services/passkey.service";
import {
  createSessionCookie,
  setSessionCookieHeaders,
} from "../services/session.service";
import type { RouteHandler } from "./types";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new PasskeyError("Invalid JSON body", 400);
  }
}

function errorResponse(err: unknown): Response {
  if (err instanceof PasskeyError) {
    return json({ error: err.message }, { status: err.status });
  }
  console.error("[passkey]", err);
  return json({ error: "Passkey request failed" }, { status: 500 });
}

/**
 * Routes under /api/auth/passkey/login/* and GET /api/auth/passkey/available
 * are public (see PUBLIC_PASSKEY_ROUTES); everything else here requires a
 * session and passes the default-password gate.
 */
export const PUBLIC_PASSKEY_ROUTES = new Set([
  "GET /api/auth/passkey/available",
  "POST /api/auth/passkey/login/options",
  "POST /api/auth/passkey/login/verify",
]);

export const passkeyRoutes: Record<string, RouteHandler> = {
  // Lets the login page decide whether to offer the passkey button. Reveals
  // only a boolean, never credential IDs.
  "GET /api/auth/passkey/available": () => json({ available: hasPasskeys() }),

  "POST /api/auth/passkey/login/options": async (req, _params, context) => {
    const key = clientKey(context?.clientAddress);
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
    try {
      if (!hasPasskeys()) {
        return json({ error: "No passkeys registered" }, { status: 404 });
      }
      return json(await startAuthentication(relyingPartyFromRequest(req)));
    } catch (err) {
      return errorResponse(err);
    }
  },

  "POST /api/auth/passkey/login/verify": async (req, _params, context) => {
    const key = clientKey(context?.clientAddress);
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
    try {
      const body = await readJson<{ response?: unknown }>(req);
      await finishAuthentication(body.response);
    } catch (err) {
      // Only a failed credential check counts as a guess; malformed or
      // expired requests do not burn attempts (same rule as password login).
      if (err instanceof PasskeyError && err.status === 401) {
        loginRateLimiter.recordFailure(key);
        return json(
          {
            error: err.message,
            attemptsRemaining: loginRateLimiter.check(key).remaining,
          },
          { status: 401 },
        );
      }
      return errorResponse(err);
    }

    loginRateLimiter.reset(key);
    return json(
      { ok: true },
      { status: 200, headers: setSessionCookieHeaders(createSessionCookie()) },
    );
  },

  "GET /api/auth/passkeys": () => json({ passkeys: listPasskeys() }),

  "POST /api/auth/passkey/register/options": async (req) => {
    try {
      return json(await startRegistration(relyingPartyFromRequest(req)));
    } catch (err) {
      return errorResponse(err);
    }
  },

  "POST /api/auth/passkey/register/verify": async (req) => {
    try {
      const body = await readJson<{ response?: unknown; name?: unknown }>(req);
      const passkey = await finishRegistration(body.response, body.name);
      return json({ passkey }, { status: 201 });
    } catch (err) {
      return errorResponse(err);
    }
  },

  "PATCH /api/auth/passkeys/:id": async (req, params) => {
    try {
      const body = await readJson<{ name?: unknown }>(req);
      return json({ passkey: renamePasskey(params?.id ?? "", body.name) });
    } catch (err) {
      return errorResponse(err);
    }
  },

  "DELETE /api/auth/passkeys/:id": (_req, params) => {
    try {
      deletePasskey(params?.id ?? "");
      return json({ ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  },
};
