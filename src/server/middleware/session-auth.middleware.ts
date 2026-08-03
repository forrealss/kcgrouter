import { verify as verifySession, getCookieFromRequest } from "../services/session.service";

export function authenticateSession(req: Request): { ok: true } | { ok: false; response: Response } {
  const cookie = getCookieFromRequest(req);

  if (!cookie || !verifySession(cookie)) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true };
}
