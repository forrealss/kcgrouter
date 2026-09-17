import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  ensureFreshAccessToken,
  isOAuthAccount,
  parseOAuthBlob,
  serializeOAuthBlob,
} from "../antigravity-oauth.service";
import {
  addAccount,
  createProvider,
  getDecryptedCredential,
  type NewProviderInput,
} from "../provider-registry.service";

const originalFetch = globalThis.fetch;
let refreshCallCount = 0;

function mockTokenEndpoint(): void {
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    if (!body.includes("grant_type=refresh_token")) {
      return new Response("unexpected endpoint", { status: 500 });
    }
    refreshCallCount += 1;
    return new Response(
      JSON.stringify({
        access_token: `at_${refreshCallCount}`,
        expires_in: 3600,
      }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("antigravity-oauth.service", () => {
  let providerId: string;
  let oauthAccountId: string;
  let apiKeyAccountId: string;

  beforeAll(() => {
    runMigrations();
    const input: NewProviderInput = {
      name: "AG Test Provider",
      transport: "antigravity",
      baseUrl: "https://daily-cloudcode-pa.googleapis.com",
      prefix: "ag-test",
    };
    providerId = createProvider(input).id;

    // OAuth account: apiKey is the (soon stale) access token
    oauthAccountId = addAccount(providerId, {
      label: "oauth",
      apiKey: "stale_token",
      oauth: {
        refreshToken: "rt_1",
        email: "me@example.com",
        projectId: "proj-9",
        expiresIn: 3600,
      },
    }).id;

    apiKeyAccountId = addAccount(providerId, {
      label: "plain",
      apiKey: "sk_plain",
    }).id;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("blob round-trips through encrypt/decrypt", () => {
    const enc = serializeOAuthBlob({ refreshToken: "rt", projectId: "p" });
    const blob = parseOAuthBlob(enc);
    expect(blob?.refreshToken).toBe("rt");
    expect(blob?.projectId).toBe("p");
  });

  test("parseOAuthBlob returns null for garbage", () => {
    expect(parseOAuthBlob(null)).toBeNull();
    expect(parseOAuthBlob("not-encrypted")).toBeNull();
  });

  test("isOAuthAccount distinguishes oauth vs apikey accounts", () => {
    expect(isOAuthAccount(oauthAccountId)).toBe(true);
    expect(isOAuthAccount(apiKeyAccountId)).toBe(false);
  });

  test("getDecryptedCredential exposes projectId/email for oauth accounts", () => {
    const cred = getDecryptedCredential(oauthAccountId);
    expect(cred.apiKey).toBe("stale_token");
    expect(cred.projectId).toBe("proj-9");
    expect(cred.email).toBe("me@example.com");

    const plain = getDecryptedCredential(apiKeyAccountId);
    expect(plain.apiKey).toBe("sk_plain");
    expect(plain.projectId).toBeUndefined();
  });

  test("ensureFreshAccessToken refreshes an expiring token via Google", async () => {
    // Force the stored expiry into the refresh lead window.
    run(
      "UPDATE provider_accounts SET oauth_expires_at = ? WHERE id = ?",
      new Date(Date.now() + 60_000).toISOString(),
      oauthAccountId,
    );

    mockTokenEndpoint();
    refreshCallCount = 0;

    const cred = await ensureFreshAccessToken(oauthAccountId);
    expect(cred?.apiKey).toBe("at_1");
    expect(cred?.projectId).toBe("proj-9");
    expect(refreshCallCount).toBe(1);

    // A second call within the fresh window must NOT hit the token endpoint again.
    const again = await ensureFreshAccessToken(oauthAccountId);
    expect(again?.apiKey).toBe("at_1");
    expect(refreshCallCount).toBe(1);
  });

  test("ensureFreshAccessToken passes plain apikey accounts through", async () => {
    const cred = await ensureFreshAccessToken(apiKeyAccountId);
    expect(cred?.apiKey).toBe("sk_plain");
  });

  test("ensureFreshAccessToken returns null for unknown accounts", async () => {
    const cred = await ensureFreshAccessToken("acct_does_not_exist");
    expect(cred).toBeNull();
  });
});
