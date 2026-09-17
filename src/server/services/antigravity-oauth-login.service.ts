/**
 * In-memory registry of in-flight Antigravity OAuth login sessions.
 *
 * The dashboard-driven flow is split across HTTP requests, so the callback
 * server created by /oauth/start has to outlive that request. Sessions hold
 * the bound listener and resolve when Google redirects back; they self-expire
 * after OAUTH_TIMEOUT_MS and are cleaned up lazily on every access.
 */

import {
  buildAuthUrl,
  type CallbackServer,
  OAUTH_TIMEOUT_MS,
  startBoundCallbackServer,
} from "../providers/antigravity/oauth";

export interface OAuthLoginSession {
  loginId: string;
  authUrl: string;
  redirectUri: string;
  expiresAt: number;
  waitForCode: () => Promise<string>;
  close: () => void;
}

const sessions = new Map<string, OAuthLoginSession>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      session.close();
      sessions.delete(id);
    }
  }
}

export async function createOAuthLoginSession(): Promise<OAuthLoginSession> {
  cleanupExpired();

  // Bind the loopback listener *before* returning: Google redirects the
  // browser to this address, so it must be accepting connections already.
  const cb: CallbackServer = await startBoundCallbackServer();
  const loginId = cb.state;
  const authUrl = buildAuthUrl(cb.redirectUri, cb.state);
  const expiresAt = Date.now() + OAUTH_TIMEOUT_MS;

  const session: OAuthLoginSession = {
    loginId,
    authUrl,
    redirectUri: cb.redirectUri,
    expiresAt,
    waitForCode: () => cb.waitForCode(),
    close: () => cb.close(),
  };
  sessions.set(loginId, session);
  return session;
}

export function getOAuthLoginSession(
  loginId: string,
): OAuthLoginSession | null {
  cleanupExpired();
  return sessions.get(loginId) ?? null;
}

export function removeOAuthLoginSession(loginId: string): boolean {
  const session = sessions.get(loginId);
  if (!session) return false;
  session.close();
  sessions.delete(loginId);
  return true;
}
