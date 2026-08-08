import { afterEach, describe, expect, test } from "bun:test";

import { resolveQoderCredentials } from "../model-catalog";

type FetchHandler = (url: string, init: RequestInit) => Promise<Response>;

let restoreFetch: (() => void) | null = null;

function stubFetch(handler: FetchHandler): void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

describe("resolveQoderCredentials", () => {
  test("exchanges a PAT for a job token and resolves the userId", async () => {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(url);
      if (url.includes("/jobToken/exchange")) {
        expect(init.method).toBe("POST");
        const body = JSON.parse(String(init.body));
        expect(body.personal_token).toBe("pt-abc123");
        return jsonResponse({ token: "jt-exchanged", expires_in: 3600 });
      }
      if (url.includes("/userinfo")) {
        expect(init.headers).toMatchObject({
          Authorization: "Bearer jt-exchanged",
        });
        return jsonResponse({ id: "user-42" });
      }
      return jsonResponse({}, 404);
    });

    const resolved = await resolveQoderCredentials("pt-abc123");
    expect(resolved.accessToken).toBe("jt-exchanged");
    expect(resolved.userId).toBe("user-42");
    expect(resolved.machineId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.length).toBe(2);
  });

  test("reuses the cached job token without re-exchanging", async () => {
    let exchangeCount = 0;
    stubFetch(async (url, _init) => {
      if (url.includes("/jobToken/exchange")) {
        exchangeCount += 1;
        return jsonResponse({ token: "jt-cached", expires_in: 86400 });
      }
      if (url.includes("/userinfo")) {
        return jsonResponse({ id: "user-7" });
      }
      return jsonResponse({}, 404);
    });

    await resolveQoderCredentials("pt-cacheme");
    const second = await resolveQoderCredentials("pt-cacheme");
    expect(second.accessToken).toBe("jt-cached");
    expect(exchangeCount).toBe(1);
  });

  test("uses a job token directly and resolves the userId via userinfo", async () => {
    stubFetch(async (url) => {
      if (url.includes("/userinfo")) {
        return jsonResponse({ userId: "user-jt" });
      }
      return jsonResponse({}, 404);
    });

    const resolved = await resolveQoderCredentials("jt-direct-token");
    expect(resolved.accessToken).toBe("jt-direct-token");
    expect(resolved.userId).toBe("user-jt");
  });

  test("throws a clear error when the PAT exchange fails", async () => {
    stubFetch(async () => jsonResponse({ error: "bad token" }, 401));

    await expect(resolveQoderCredentials("pt-badtoken")).rejects.toThrow(
      /PAT exchange failed/,
    );
  });

  test("rejects tokens that are neither PAT nor job token", async () => {
    stubFetch(async () => jsonResponse({}, 404));

    await expect(
      resolveQoderCredentials("dt-some-device-token"),
    ).rejects.toThrow(/Personal Access Token/);
    await expect(resolveQoderCredentials("random-string")).rejects.toThrow(
      /Personal Access Token/,
    );
  });
});
