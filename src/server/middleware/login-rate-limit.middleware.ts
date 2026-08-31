/**
 * In-memory sliding-window rate limiter for failed login attempts.
 *
 * Scoped per client IP so one attacker cannot lock the operator out of their
 * own dashboard, and self-healing: attempts older than the window are dropped,
 * so a blocked client recovers on its own without any admin action.
 *
 * State is per-process and intentionally not persisted — a restart clearing the
 * counters is acceptable for a single-user tool, and a restart is far more
 * expensive for an attacker than for the owner.
 */

/** Failed attempts allowed within the window before a client is blocked. */
export const MAX_ATTEMPTS = 5;

/** Sliding window length, in milliseconds. */
export const WINDOW_MS = 15 * 60 * 1000;

export interface RateLimitDecision {
  allowed: boolean;
  /** Attempts still available before blocking (0 when blocked). */
  remaining: number;
  /** Seconds until the oldest attempt ages out; only meaningful when blocked. */
  retryAfterSeconds: number;
}

export interface LoginRateLimiterOptions {
  maxAttempts?: number;
  windowMs?: number;
  /** Injectable clock; defaults to Date.now. Tests drive time explicitly. */
  now?: () => number;
}

/**
 * Tracks failed attempts per key. Callers record only failures: a successful
 * login clears the key, so ordinary use never approaches the limit.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: LoginRateLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    this.windowMs = options.windowMs ?? WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  /** Drop timestamps that have aged out, returning what remains. */
  private live(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.attempts.get(key) ?? []).filter(
      (stamp) => stamp > cutoff,
    );
    if (kept.length === 0) this.attempts.delete(key);
    else this.attempts.set(key, kept);
    return kept;
  }

  /** Whether this key may attempt a login right now. Does not record anything. */
  check(key: string): RateLimitDecision {
    const kept = this.live(key);
    if (kept.length < this.maxAttempts) {
      return {
        allowed: true,
        remaining: this.maxAttempts - kept.length,
        retryAfterSeconds: 0,
      };
    }

    // Blocked until the oldest attempt in the window ages out.
    const oldest = Math.min(...kept);
    const msRemaining = oldest + this.windowMs - this.now();
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(msRemaining / 1000)),
    };
  }

  /** Record one failed attempt. */
  recordFailure(key: string): void {
    const kept = this.live(key);
    kept.push(this.now());
    this.attempts.set(key, kept);
  }

  /** Clear a key's history — called after a successful login. */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /** Number of tracked keys; used by tests to assert cleanup. */
  get size(): number {
    return this.attempts.size;
  }

  /** Drop all state (test helper). */
  clear(): void {
    this.attempts.clear();
  }
}

/** Shared limiter used by the login route. */
export const loginRateLimiter = new LoginRateLimiter();

/**
 * Identify the client for rate-limiting purposes.
 *
 * Falls back to a constant when the address is unavailable so requests without
 * a resolvable peer still share a bucket rather than bypassing the limit
 * entirely. Proxy headers are deliberately ignored: they are attacker-supplied
 * unless a trusted proxy is configured, and trusting them would let a caller
 * mint unlimited buckets with a spoofed X-Forwarded-For.
 */
export function clientKey(address: string | null | undefined): string {
  return address && address.length > 0 ? address : "unknown";
}
