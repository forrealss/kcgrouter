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

  "POST /api/auth/login": async (req) => {
    const body = (await req.json()) as { password?: string };
    if (!body.password) {
      return new Response(JSON.stringify({ error: "Password required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await login(body.password);
    if (!result) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...setSessionCookieHeaders(result.cookie),
      },
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
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
