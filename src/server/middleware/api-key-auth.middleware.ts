import { verifyApiKey } from "../services/settings.service";

export function authenticateApiKey(req: Request): { ok: true; keyId: string } | { ok: false; response: Response } {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const token = authHeader.slice(7);
  const keyRow = verifyApiKey(token);

  if (!keyRow) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid or revoked API key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, keyId: keyRow.id };
}
