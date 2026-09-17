/**
 * Antigravity OAuth (Google authorization-code flow) — ported from 9router's
 * src/lib/oauth/providers/antigravity.js.
 *
 * Flow:
 *   1. Start a local callback server and build the Google authorize URL
 *   2. The user opens the URL in a browser and consents
 *   3. Google redirects to the local callback with ?code=...
 *   4. The code is exchanged for access/refresh tokens
 *   5. loadCodeAssist resolves the user's Cloud Code projectId (best effort,
 *      falling back to a generated id) and onboarding is kicked off
 *
 * The client id/secret are the public CLI credentials of the Antigravity IDE —
 * the same constants 9router ships.
 */

import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

// --- Constants (public Antigravity IDE CLI client) ---

export const ANTIGRAVITY_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
export const ANTIGRAVITY_CLIENT_SECRET = "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";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USER_INFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo";
const LOAD_CODE_ASSIST_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const ONBOARD_USER_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:onboardUser";

const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const OAUTH_CALLBACK_PORT = 51193;
export const OAUTH_TIMEOUT_MS = 300_000;

/** Matches the Antigravity IDE binary's ClientMetadata platform enum. */
export function getOAuthPlatformEnum(): number {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin") return arch === "arm64" ? 2 : 1;
  if (platform === "linux") return arch === "arm64" ? 4 : 3;
  if (platform === "win32") return 5;
  return 0;
}

export function getOAuthClientMetadata(): {
  ideType: number;
  platform: number;
  pluginType: number;
} {
  return { ideType: 9, platform: getOAuthPlatformEnum(), pluginType: 2 };
}

// --- Credential shape carried by adapters ---

export interface AntigravityCredential {
  apiKey: string; // live access token
  refreshToken?: string;
  expiresAt?: string;
  projectId?: string;
  /** Stable per-account key used to seed request ids. */
  accountId?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope?: string;
}

export interface OAuthLoginResult extends OAuthTokens {
  email?: string;
  projectId?: string;
}

// --- Step 1: local callback server + authorize URL ---

export interface CallbackServer {
  server: Server;
  state: string;
  /** Port the server was created for; the actually-bound port comes from startBoundCallbackServer. */
  port: number;
  redirectUri: string;
  /** Resolves with the authorization code, rejects on error/timeout. */
  waitForCode: () => Promise<string>;
  close: () => void;
}

/**
 * Creates (but does not start listening on) the local callback server.
 * Use `startBoundCallbackServer` — or the CLI-only `waitForCallback` — which
 * manage binding and timeouts for you.
 */
export function startCallbackServer(
  port = OAUTH_CALLBACK_PORT,
): CallbackServer {
  const state = randomBytes(16).toString("hex");
  // Buffer the outcome at request time: Google may redirect back before the
  // caller invokes waitForCode(), and an unbuffered deferred would lose it.
  let settled: { code?: string; error?: Error } | null = null;
  let pending: {
    resolve: (code: string) => void;
    reject: (err: Error) => void;
  } | null = null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }

    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    res.writeHead(200, { "Content-Type": "text/html" });

    const fail = (err: Error) => {
      if (pending) pending.reject(err);
      else settled ??= { error: err };
    };

    if (error) {
      res.end(
        `<html><body><h2>Antigravity login failed</h2><p>${error}</p></body></html>`,
      );
      fail(new Error(`OAuth error: ${error}`));
      return;
    }
    if (!code) {
      res.end("<html><body><h2>Missing authorization code</h2></body></html>");
      fail(new Error("No authorization code in callback"));
      return;
    }
    if (returnedState !== state) {
      res.end("<html><body><h2>State mismatch</h2></body></html>");
      fail(new Error("OAuth state mismatch"));
      return;
    }

    res.end(
      "<html><body><h2>Antigravity login successful</h2>You can close this tab and return to kcgrouter.</body></html>",
    );
    if (pending) pending.resolve(code);
    else settled ??= { code };
  });

  return {
    server,
    state,
    port,
    redirectUri: `http://127.0.0.1:${port}/callback`,
    waitForCode: () => {
      if (settled) {
        return settled.error
          ? Promise.reject(settled.error)
          : Promise.resolve(settled.code as string);
      }
      return new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    close: () => server.close(),
  };
}

/**
 * Creates the callback server and binds it to 127.0.0.1 before returning, so
 * Google's redirect actually reaches us (an unbound server yields
 * ERR_CONNECTION_REFUSED in the browser).
 *
 * Prefers the fixed Antigravity callback port, falling back to an ephemeral
 * one when it is taken — Google's loopback rules for installed clients accept
 * any port, and 9router relies on the same behavior with a random port.
 */
export function startBoundCallbackServer(
  preferredPort = OAUTH_CALLBACK_PORT,
): Promise<CallbackServer> {
  const attempt = (port: number, allowFallback: boolean) =>
    new Promise<CallbackServer>((resolve, reject) => {
      const cb = startCallbackServer(port);
      cb.server.once("error", (err: Error & { code?: string }) => {
        cb.server.close();
        if (
          allowFallback &&
          (err.code === "EADDRINUSE" || err.code === "EACCES")
        ) {
          resolve(attempt(0, false));
          return;
        }
        reject(err);
      });
      cb.server.listen(port, "127.0.0.1", () => {
        const address = cb.server.address();
        const boundPort =
          typeof address === "object" && address !== null ? address.port : port;
        resolve({
          ...cb,
          port: boundPort,
          redirectUri: `http://127.0.0.1:${boundPort}/callback`,
        });
      });
    });

  return attempt(preferredPort, true);
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Binds the callback listener and returns the authorize URL plus a `run()`
 * promise resolving with the authorization code (or rejecting on
 * timeout/error). Convenience wrapper for CLI use; the dashboard flow uses
 * the login-session service instead.
 */
export function waitForCallback(
  port = OAUTH_CALLBACK_PORT,
  timeoutMs = OAUTH_TIMEOUT_MS,
): { authUrl: string; run: () => Promise<string>; close: () => void } {
  const cb = startCallbackServer(port);

  return {
    authUrl: buildAuthUrl(cb.redirectUri, cb.state),
    run: () => {
      return new Promise<string>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        };

        const timer = setTimeout(() => {
          settle(() => {
            cb.server.close();
            reject(new Error("OAuth login timed out"));
          });
        }, timeoutMs);

        cb.server.once("error", (err) => {
          settle(() =>
            reject(
              new Error(
                `Cannot bind OAuth callback port ${port}: ${err.message}`,
              ),
            ),
          );
        });

        cb.server.listen(port, "127.0.0.1", () => {
          // Listening — the caller should now open authUrl in a browser.
        });

        cb.waitForCode().then(
          (code) =>
            settle(() => {
              cb.server.close();
              resolve(code);
            }),
          (err) =>
            settle(() => {
              cb.server.close();
              reject(err);
            }),
        );
      });
    },
    close: () => cb.server.close(),
  };
}

// --- Step 2: token exchange ---

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token)
    throw new Error("Token exchange returned no access_token");
  if (!json.refresh_token) {
    throw new Error(
      "Token exchange returned no refresh_token (re-consent required)",
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope,
  };
}

// --- Step 3: refresh (no browser needed) ---

export async function refreshAccessToken(
  refreshToken: string,
): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token)
    throw new Error("Token refresh returned no access_token");

  return {
    accessToken: json.access_token,
    // Google does not rotate the refresh token on grant_type=refresh_token.
    refreshToken: json.refresh_token || refreshToken,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope,
  };
}

// --- Step 4: post-exchange onboarding (projectId resolution) ---

export async function retrieveUserInfo(
  accessToken: string,
): Promise<{ email?: string; projectId?: string }> {
  // Fetch user info (best effort)
  let email: string | undefined;
  try {
    const res = await fetch(`${USER_INFO_URL}?alt=json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { email?: string };
      email = json.email;
    }
  } catch {
    // non-fatal
  }

  // Load Code Assist to resolve the Cloud Code project
  let projectId = "";
  let tierId = "legacy-tier";
  const loadHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "antigravity/ide/2.11.0 darwin/arm64",
    "x-request-source": "local",
  };

  try {
    const loadRes = await fetch(LOAD_CODE_ASSIST_URL, {
      method: "POST",
      headers: loadHeaders,
      body: JSON.stringify({ metadata: getOAuthClientMetadata() }),
    });
    if (loadRes.ok) {
      const data = (await loadRes.json()) as {
        cloudaicompanionProject?: { id?: string } | string;
        allowedTiers?: { isDefault?: boolean; id?: string }[];
      };
      projectId =
        typeof data.cloudaicompanionProject === "string"
          ? data.cloudaicompanionProject
          : (data.cloudaicompanionProject?.id ?? "");
      const defaultTier = data.allowedTiers?.find((t) => t.isDefault && t.id);
      if (defaultTier?.id) tierId = defaultTier.id.trim();
    }
  } catch {
    // non-fatal — the adapter generates a fallback projectId
  }

  // Fire-and-forget onboarding (matching 9router): required for brand-new
  // Google accounts before the Cloud Code API will serve them.
  if (projectId) {
    void (async () => {
      for (let i = 0; i < 10; i++) {
        try {
          const onboardRes = await fetch(ONBOARD_USER_URL, {
            method: "POST",
            headers: loadHeaders,
            body: JSON.stringify({
              tierId,
              metadata: getOAuthClientMetadata(),
            }),
          });
          if (onboardRes.ok) {
            const result = (await onboardRes.json()) as { done?: boolean };
            if (result.done === true) break;
          }
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    })();
  }

  return { email, projectId: projectId || undefined };
}
