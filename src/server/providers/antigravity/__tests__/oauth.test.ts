import { afterEach, describe, expect, test } from "bun:test";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  getOAuthClientMetadata,
  OAUTH_CALLBACK_PORT,
  refreshAccessToken,
  startBoundCallbackServer,
} from "../oauth";

describe("antigravity oauth — auth url", () => {
  test("includes client id, offline access, consent prompt, and state", () => {
    const url = new URL(
      buildAuthUrl("http://127.0.0.1:51193/callback", "st4te"),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe(
      "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:51193/callback",
    );
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("cloud-platform");
    expect(url.searchParams.get("scope")).toContain("cclog");
  });
});

type FetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function mockFetch(impl: FetchMock): void {
  globalThis.fetch = impl as unknown as typeof fetch;
}

describe("antigravity oauth — token exchange", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("posts the authorization code and returns mapped tokens", async () => {
    let capturedBody = "";
    mockFetch(async (_input, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          access_token: "at_1",
          refresh_token: "rt_1",
          expires_in: 3599,
        }),
        { status: 200 },
      );
    });

    const tokens = await exchangeCodeForTokens(
      "authcode",
      "http://127.0.0.1:51193/callback",
    );
    expect(tokens.accessToken).toBe("at_1");
    expect(tokens.refreshToken).toBe("rt_1");
    expect(tokens.expiresIn).toBe(3599);
    expect(capturedBody).toContain("grant_type=authorization_code");
    expect(capturedBody).toContain("code=authcode");
  });

  test("throws when Google rejects the code", async () => {
    mockFetch(async () => new Response("invalid_grant", { status: 400 }));

    expect(
      exchangeCodeForTokens("bad", "http://127.0.0.1:51193/callback"),
    ).rejects.toThrow("Token exchange failed");
  });
});

describe("antigravity oauth — refresh", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("uses grant_type=refresh_token and keeps the existing refresh token", async () => {
    let capturedBody = "";
    mockFetch(async (_input, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ access_token: "at_2", expires_in: 3600 }),
        { status: 200 },
      );
    });

    const tokens = await refreshAccessToken("rt_existing");
    expect(tokens.accessToken).toBe("at_2");
    // Google does not rotate the refresh token — keep the old one.
    expect(tokens.refreshToken).toBe("rt_existing");
    expect(capturedBody).toContain("grant_type=refresh_token");
    expect(capturedBody).toContain("refresh_token=rt_existing");
    expect(capturedBody).toContain(
      "client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
    );
  });
});

describe("antigravity oauth — client metadata", () => {
  test("matches the IDE binary enum shape", () => {
    const meta = getOAuthClientMetadata();
    expect(meta.ideType).toBe(9);
    expect(meta.pluginType).toBe(2);
    expect([0, 1, 2, 3, 4, 5]).toContain(meta.platform);
  });
});

describe("antigravity oauth — bound callback server", () => {
  const opened: Awaited<ReturnType<typeof startBoundCallbackServer>>[] = [];

  afterEach(async () => {
    for (const cb of opened.splice(0)) cb.close();
    await new Promise((r) => setTimeout(r, 20));
  });

  test("binds the fixed callback port so Google's redirect is reachable", async () => {
    const cb = await startBoundCallbackServer();
    opened.push(cb);

    expect(cb.port).toBe(OAUTH_CALLBACK_PORT);
    expect(cb.redirectUri).toBe(
      `http://127.0.0.1:${OAUTH_CALLBACK_PORT}/callback`,
    );

    // A redirect from Google arrives with the code before waitForCode() is
    // called — the buffered deferred must still resolve.
    const res = await fetch(
      `http://127.0.0.1:${cb.port}/callback?code=xyz&state=${cb.state}`,
    );
    expect(res.status).toBe(200);
    await expect(cb.waitForCode()).resolves.toBe("xyz");
  });

  test("falls back to an ephemeral port when the fixed one is busy", async () => {
    const first = await startBoundCallbackServer();
    opened.push(first);
    expect(first.port).toBe(OAUTH_CALLBACK_PORT);

    const second = await startBoundCallbackServer();
    opened.push(second);
    expect(second.port).not.toBe(OAUTH_CALLBACK_PORT);
    expect(second.redirectUri).toBe(`http://127.0.0.1:${second.port}/callback`);

    const res = await fetch(
      `http://127.0.0.1:${second.port}/callback?code=abc&state=${second.state}`,
    );
    expect(res.status).toBe(200);
    await expect(second.waitForCode()).resolves.toBe("abc");
  });

  test("waitForCode rejects on an OAuth error redirect", async () => {
    const cb = await startBoundCallbackServer();
    opened.push(cb);

    await fetch(
      `http://127.0.0.1:${cb.port}/callback?error=access_denied&state=${cb.state}`,
    );
    await expect(cb.waitForCode()).rejects.toThrow(
      "OAuth error: access_denied",
    );
  });
});
