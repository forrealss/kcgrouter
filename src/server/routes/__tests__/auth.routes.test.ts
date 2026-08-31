import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDefaultPasswordHintEnabled } from "../../../config";
import { runMigrations } from "../../../db/migrations";
import { DEFAULT_PASSWORD } from "../../../lib/password-strength";
import {
  loginRateLimiter,
  MAX_ATTEMPTS,
} from "../../middleware/login-rate-limit.middleware";
import { hashPassword } from "../../services/crypto.service";
import { setPasswordHash } from "../../services/settings.service";
import { authRoutes } from "../auth.routes";
import type { RouteContext, RouteHandler } from "../types";

const originalHome = process.env.KCGRouter_HOME;
let tempHome: string;

function handler(key: string): RouteHandler {
  const found = authRoutes[key];
  if (!found) throw new Error(`route ${key} is not registered`);
  return found;
}

function postLogin(
  password: unknown,
  clientAddress: string | null = "203.0.113.9",
): Promise<Response> {
  const context: RouteContext = { clientAddress };
  return Promise.resolve(
    handler("POST /api/auth/login")(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }),
      {},
      context,
    ),
  );
}

function getHint(): Promise<Response> {
  return Promise.resolve(
    handler("GET /api/auth/default-password-hint")(
      new Request("http://localhost/api/auth/default-password-hint"),
      {},
      { clientAddress: null },
    ),
  );
}

beforeAll(() => {
  runMigrations();
});

beforeEach(async () => {
  // Each test gets its own config.json so the hint flag never leaks across.
  tempHome = mkdtempSync(join(tmpdir(), "kcgrouter-auth-"));
  process.env.KCGRouter_HOME = tempHome;
  loginRateLimiter.clear();
  await setPasswordHash(await hashPassword(DEFAULT_PASSWORD));
});

afterEach(() => {
  if (originalHome) process.env.KCGRouter_HOME = originalHome;
  else delete process.env.KCGRouter_HOME;
  rmSync(tempHome, { recursive: true, force: true });
  loginRateLimiter.clear();
});

describe("POST /api/auth/login", () => {
  test("accepts the correct password and sets a session cookie", async () => {
    const res = await postLogin(DEFAULT_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("session=");
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  test("rejects a wrong password with 401", async () => {
    const res = await postLogin("definitely-wrong");
    expect(res.status).toBe(401);
  });

  test("reports remaining attempts on failure", async () => {
    const first = (await (await postLogin("wrong")).json()) as {
      attemptsRemaining: number;
    };
    const second = (await (await postLogin("wrong")).json()) as {
      attemptsRemaining: number;
    };
    expect(second.attemptsRemaining).toBe(first.attemptsRemaining - 1);
  });

  test("a missing password is a 400 and does not consume an attempt", async () => {
    const res = await postLogin(undefined);
    expect(res.status).toBe(400);

    // Still fully allowed afterwards.
    const failure = (await (await postLogin("wrong")).json()) as {
      attemptsRemaining: number;
    };
    // One failure consumed exactly one slot, so remaining is max - 1.
    expect(failure.attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
  });

  describe("rate limiting", () => {
    test("blocks with 429 and Retry-After after repeated failures", async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const res = await postLogin("wrong");
        expect(res.status).toBe(401);
      }

      const blocked = await postLogin("wrong");
      expect(blocked.status).toBe(429);
      const retryAfter = Number(blocked.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThan(0);

      const body = (await blocked.json()) as { code: string };
      expect(body.code).toBe("rate_limited");
    });

    test("blocks even the correct password once limited", async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) await postLogin("wrong");

      // Refusing the right password is the point: otherwise an attacker who
      // guesses on attempt 11 still gets in.
      const res = await postLogin(DEFAULT_PASSWORD);
      expect(res.status).toBe(429);
    });

    test("limits per client, not globally", async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++)
        await postLogin("wrong", "198.51.100.1");

      expect((await postLogin("wrong", "198.51.100.1")).status).toBe(429);
      // A different operator on another machine is unaffected.
      expect((await postLogin(DEFAULT_PASSWORD, "198.51.100.2")).status).toBe(
        200,
      );
    });

    test("a successful login clears the failure count", async () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await postLogin("wrong");
      expect((await postLogin(DEFAULT_PASSWORD)).status).toBe(200);

      const afterReset = (await (await postLogin("wrong")).json()) as {
        attemptsRemaining: number;
      };
      expect(afterReset.attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
    });
  });
});

describe("GET /api/auth/default-password-hint", () => {
  test("shows the hint on a fresh install still using the default", async () => {
    const body = (await (await getHint()).json()) as { show: boolean };
    expect(body.show).toBe(true);
  });

  test("hides the hint once config.json disables it", async () => {
    setDefaultPasswordHintEnabled(false);
    const body = (await (await getHint()).json()) as { show: boolean };
    expect(body.show).toBe(false);
  });

  test("hides the hint once the password is no longer the default", async () => {
    await setPasswordHash(await hashPassword("a-real-operator-password"));
    // The flag is still enabled, so this proves the second condition holds on
    // its own — a stale config cannot resurrect the hint.
    const body = (await (await getHint()).json()) as { show: boolean };
    expect(body.show).toBe(false);
  });

  test("never returns the password itself", async () => {
    const raw = await (await getHint()).text();
    expect(raw).not.toContain(DEFAULT_PASSWORD);
  });

  test("reports the attempt budget so the form need not hardcode it", async () => {
    const body = (await (await getHint()).json()) as { maxAttempts: number };
    expect(body.maxAttempts).toBe(MAX_ATTEMPTS);
  });

  test("reports no cooldown when the client is not locked out", async () => {
    const body = (await (await getHint()).json()) as {
      retryAfterSeconds: number;
    };
    expect(body.retryAfterSeconds).toBe(0);
  });

  test("reports the remaining cooldown so a reload resumes the countdown", async () => {
    const ip = "203.0.113.55";
    for (let i = 0; i < MAX_ATTEMPTS; i++) await postLogin("wrong", ip);

    const res = await Promise.resolve(
      handler("GET /api/auth/default-password-hint")(
        new Request("http://localhost/api/auth/default-password-hint"),
        {},
        { clientAddress: ip },
      ),
    );
    const body = (await res.json()) as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("rate limit configuration", () => {
  test("allows five attempts", () => {
    // Pinned deliberately: the login form renders one segment per attempt, so
    // changing this silently would reshape the UI.
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
