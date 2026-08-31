import { describe, expect, test } from "bun:test";
import {
  clientKey,
  LoginRateLimiter,
  MAX_ATTEMPTS,
  WINDOW_MS,
} from "../login-rate-limit.middleware";

/** Limiter whose clock the test drives explicitly, so no sleeping is needed. */
function makeLimiter(
  options: { maxAttempts?: number; windowMs?: number } = {},
) {
  let current = 1_000_000;
  const limiter = new LoginRateLimiter({
    maxAttempts: options.maxAttempts ?? 3,
    windowMs: options.windowMs ?? 60_000,
    now: () => current,
  });
  return {
    limiter,
    advance(ms: number) {
      current += ms;
    },
  };
}

const IP = "203.0.113.7";

describe("LoginRateLimiter", () => {
  test("allows attempts below the limit", () => {
    const { limiter } = makeLimiter();

    expect(limiter.check(IP).allowed).toBe(true);
    limiter.recordFailure(IP);
    limiter.recordFailure(IP);
    expect(limiter.check(IP).allowed).toBe(true);
  });

  test("blocks once the limit is reached", () => {
    const { limiter } = makeLimiter({ maxAttempts: 3 });

    for (let i = 0; i < 3; i++) limiter.recordFailure(IP);

    const decision = limiter.check(IP);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  test("reports remaining attempts as it counts down", () => {
    const { limiter } = makeLimiter({ maxAttempts: 3 });

    expect(limiter.check(IP).remaining).toBe(3);
    limiter.recordFailure(IP);
    expect(limiter.check(IP).remaining).toBe(2);
    limiter.recordFailure(IP);
    expect(limiter.check(IP).remaining).toBe(1);
  });

  test("check() alone never consumes an attempt", () => {
    const { limiter } = makeLimiter({ maxAttempts: 3 });

    for (let i = 0; i < 10; i++) limiter.check(IP);
    expect(limiter.check(IP).allowed).toBe(true);
    expect(limiter.check(IP).remaining).toBe(3);
  });

  describe("self-healing", () => {
    test("recovers once the window passes", () => {
      const { limiter, advance } = makeLimiter({
        maxAttempts: 3,
        windowMs: 60_000,
      });

      for (let i = 0; i < 3; i++) limiter.recordFailure(IP);
      expect(limiter.check(IP).allowed).toBe(false);

      advance(60_001);
      expect(limiter.check(IP).allowed).toBe(true);
      expect(limiter.check(IP).remaining).toBe(3);
    });

    test("expires attempts individually, not all at once", () => {
      const { limiter, advance } = makeLimiter({
        maxAttempts: 3,
        windowMs: 60_000,
      });

      limiter.recordFailure(IP);
      advance(30_000);
      limiter.recordFailure(IP);
      limiter.recordFailure(IP);
      expect(limiter.check(IP).allowed).toBe(false);

      // Only the first attempt has aged out, freeing exactly one slot.
      advance(30_001);
      const decision = limiter.check(IP);
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(1);
    });

    test("retryAfterSeconds counts down to the oldest attempt expiring", () => {
      const { limiter, advance } = makeLimiter({
        maxAttempts: 2,
        windowMs: 60_000,
      });

      limiter.recordFailure(IP);
      limiter.recordFailure(IP);
      expect(limiter.check(IP).retryAfterSeconds).toBe(60);

      advance(30_000);
      expect(limiter.check(IP).retryAfterSeconds).toBe(30);
    });

    test("retryAfterSeconds is never zero while blocked", () => {
      const { limiter, advance } = makeLimiter({
        maxAttempts: 1,
        windowMs: 60_000,
      });

      limiter.recordFailure(IP);
      // Just shy of expiry: rounding must not produce a 0-second Retry-After,
      // which clients would read as "retry immediately".
      advance(59_999);
      const decision = limiter.check(IP);
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });
  });

  describe("isolation between clients", () => {
    test("one blocked IP does not affect another", () => {
      const { limiter } = makeLimiter({ maxAttempts: 3 });
      const other = "198.51.100.4";

      for (let i = 0; i < 3; i++) limiter.recordFailure(IP);

      expect(limiter.check(IP).allowed).toBe(false);
      expect(limiter.check(other).allowed).toBe(true);
    });
  });

  describe("reset", () => {
    test("a successful login clears the history", () => {
      const { limiter } = makeLimiter({ maxAttempts: 3 });

      limiter.recordFailure(IP);
      limiter.recordFailure(IP);
      limiter.reset(IP);

      expect(limiter.check(IP).remaining).toBe(3);
    });

    test("reset unblocks immediately", () => {
      const { limiter } = makeLimiter({ maxAttempts: 2 });

      limiter.recordFailure(IP);
      limiter.recordFailure(IP);
      expect(limiter.check(IP).allowed).toBe(false);

      limiter.reset(IP);
      expect(limiter.check(IP).allowed).toBe(true);
    });
  });

  test("expired entries are dropped, not accumulated", () => {
    const { limiter, advance } = makeLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });

    limiter.recordFailure("a");
    limiter.recordFailure("b");
    expect(limiter.size).toBe(2);

    advance(60_001);
    limiter.check("a");
    limiter.check("b");
    expect(limiter.size).toBe(0);
  });

  test("ships with sane production defaults", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(WINDOW_MS).toBeGreaterThan(0);

    const limiter = new LoginRateLimiter();
    expect(limiter.check(IP).remaining).toBe(MAX_ATTEMPTS);
  });
});

describe("clientKey", () => {
  test("uses the address when present", () => {
    expect(clientKey("192.0.2.1")).toBe("192.0.2.1");
  });

  test("falls back to a shared bucket rather than bypassing the limit", () => {
    // A missing peer must not mean "unlimited attempts".
    expect(clientKey(null)).toBe("unknown");
    expect(clientKey(undefined)).toBe("unknown");
    expect(clientKey("")).toBe("unknown");
  });
});
