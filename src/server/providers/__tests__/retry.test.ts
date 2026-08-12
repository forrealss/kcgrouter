import { afterAll, describe, expect, test } from "bun:test";
import { fetchWithRetry, providerError, readRetryMeta } from "../retry";

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(
  impl: (url: string, init: RequestInit) => Response | Promise<Response>,
): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init ?? {}))) as typeof fetch;
}

afterAll(() => {
  globalThis.fetch = originalFetch;
});

const BASE_INIT = { method: "POST", headers: {}, body: "{}" } as const;

describe("fetchWithRetry", () => {
  test("retries a retryable status and succeeds", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      if (calls < 4) return jsonResponse(502, {});
      return jsonResponse(200, { ok: true });
    });

    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 502: { attempts: 3, delayMs: 0 } },
    });

    expect(calls).toBe(4); // 1 initial + 3 retries
    expect(res.ok).toBe(true);
  });

  test("stops retrying once the attempt budget is exhausted", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      return jsonResponse(502, { err: "boom" });
    });

    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 502: { attempts: 2, delayMs: 0 } },
    });

    expect(calls).toBe(3);
    expect(res.status).toBe(502);
  });

  test("retries transient network errors using the 502 rule", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      if (calls < 3) throw new TypeError("fetch failed");
      return jsonResponse(200, { ok: true });
    });

    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 502: { attempts: 3, delayMs: 0 } },
    });

    expect(calls).toBe(3);
    expect(res.ok).toBe(true);
  });

  test("throws a wrapped error after network retries are exhausted", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      throw new TypeError("fetch failed");
    });

    await expect(
      fetchWithRetry("https://x.test/chat", BASE_INIT, {
        providerName: "Test",
        retry: { 502: { attempts: 1, delayMs: 0 } },
      }),
    ).rejects.toThrow("Test API request failed after 2 attempt(s)");
    expect(calls).toBe(2);
  });

  test("carries retry metadata (status, retries) on the returned response", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      if (calls < 3) return jsonResponse(502, {});
      return jsonResponse(200, { ok: true });
    });

    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 502: { attempts: 3, delayMs: 0 } },
    });

    expect(res.ok).toBe(true);
    const meta = readRetryMeta(res);
    expect(meta).not.toBeNull();
    expect(meta?.status).toBe(200);
    expect(meta?.retries).toBe(2);
  });

  test("providerError surfaces status, Retry-After and retries", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      if (calls === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "30" },
        });
      }
      return jsonResponse(200, {});
    });

    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 502: { attempts: 2, delayMs: 0 } },
    });

    const err = providerError("Test", res, "too many");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Test API error 429: too many");
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(30_000);
    expect(err.retries).toBe(0);
  });

  test("prefers the Retry-After header over the fixed delay", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      if (calls === 1) {
        return new Response("{}", {
          status: 503,
          headers: { "Retry-After": "1" },
        });
      }
      return jsonResponse(200, { ok: true });
    });

    const start = Date.now();
    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 503: { attempts: 1, delayMs: 0 } },
    });

    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
    // Retry waited ~1s (the Retry-After hint) instead of the configured 0ms.
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });

  test("jitters the retry delay (±25%) so retries don't thundering-herd", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      if (calls === 1) return jsonResponse(503, {});
      return jsonResponse(200, { ok: true });
    });

    const start = Date.now();
    const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
      providerName: "Test",
      retry: { 503: { attempts: 1, delayMs: 1000 } },
    });

    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
    // Jittered delay = 1000 * (0.75..1.25) → 750..1250ms. The upper bound is
    // kept generous so a loaded CI machine can't flake on timer overhead.
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(700);
    expect(elapsed).toBeLessThanOrEqual(1600);
  });

  test("does not retry non-retryable statuses like 429 or 401", async () => {
    for (const status of [429, 401]) {
      let calls = 0;
      installFetch(() => {
        calls++;
        return jsonResponse(status, {});
      });

      const res = await fetchWithRetry("https://x.test/chat", BASE_INIT, {
        providerName: "Test",
      });
      expect(calls).toBe(1);
      expect(res.status).toBe(status);
    }
  });

  test("propagates a caller abort without retrying", async () => {
    let calls = 0;
    installFetch(() => {
      calls++;
      return jsonResponse(502, {});
    });

    const ac = new AbortController();
    ac.abort();

    await expect(
      fetchWithRetry("https://x.test/chat", BASE_INIT, {
        providerName: "Test",
        signal: ac.signal,
      }),
    ).rejects.toThrow("aborted");
    expect(calls).toBe(0);
  });
});
