import { createHmac, randomBytes } from "node:crypto";
import { get } from "../../db/client";
import type { AppSettingsRow } from "../../db/schema";
import { verifyPassword } from "./crypto.service";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-session-secret-change-me";
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sign(data: string): string {
  return createHmac("sha256", SESSION_SECRET).update(data).digest("hex");
}

function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

export interface SessionCookie {
  sessionId: string;
  signature: string;
}

function parseCookie(cookie: string): SessionCookie | null {
  const parts = cookie.split(".");
  if (parts.length !== 2) return null;
  return { sessionId: parts[0], signature: parts[1] };
}

export async function login(
  password: string,
): Promise<{ cookie: string } | null> {
  const settings = get<AppSettingsRow>(
    "SELECT * FROM app_settings WHERE id = 1",
  );
  if (!settings) return null;

  const valid = await verifyPassword(password, settings.password_hash);
  if (!valid) return null;

  const sessionId = generateSessionId();
  const signature = sign(sessionId);
  const cookie = `${sessionId}.${signature}`;

  return { cookie };
}

export function verify(cookie: string): boolean {
  const parsed = parseCookie(cookie);
  if (!parsed) return false;

  const expectedSignature = sign(parsed.sessionId);
  return parsed.signature === expectedSignature;
}

export function logout(_cookie: string): void {
  // Stateless HMAC-based sessions: no server-side invalidation needed.
  // Client simply discards the cookie.
  // For extra security, a token blacklist could be added later.
}

export function getCookieFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

export function setSessionCookieHeaders(
  cookie: string,
): Record<string, string> {
  const maxAge = Math.floor(SESSION_EXPIRY_MS / 1000);
  return {
    "Set-Cookie": `session=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  };
}

export function clearSessionCookieHeaders(): Record<string, string> {
  return {
    "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  };
}
