import { login } from "../services/session.service";
import { setSessionCookieHeaders, clearSessionCookieHeaders } from "../services/session.service";
import { changePassword } from "../services/settings.service";
import type { RouteHandler } from "./types";

export const authRoutes: Record<string, RouteHandler> = {
  "POST /api/auth/login": async (req) => {
    const body = (await req.json()) as { password?: string };
    if (!body.password) {
      return new Response(JSON.stringify({ error: "Password required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const result = await login(body.password);
    if (!result) {
      return new Response(JSON.stringify({ error: "Invalid password" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...setSessionCookieHeaders(result.cookie) },
    });
  },

  "POST /api/auth/logout": () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...clearSessionCookieHeaders() },
    });
  },

  "POST /api/auth/change-password": async (req) => {
    const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword) {
      return new Response(JSON.stringify({ error: "currentPassword and newPassword required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    try {
      await changePassword(body.currentPassword, body.newPassword);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      return new Response(JSON.stringify({ error: message }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  },
};
