/**
 * Shared fetch-with-retry for provider adapters.
 *
 * Mirrors 9router's `BaseExecutor` retry strategy:
 *   - Retry is config-driven per HTTP status code (`{ attempts, delayMs }`).
 *   - 429 is deliberately *not* retried in place (attempts 0) — a rate limit
 *     is a signal to fall over to the next account via the router, not to
 *     hammer the same account. See the account cooldown/backoff logic in
 *     provider-registry.service.ts.
 *   - Network errors / connect timeouts are mapped to the 502 retry rule,
 *     exactly like 9router converts fetch exceptions into the 502 config.
 *
 * The helper only returns the final `Response` for HTTP responses (retrying
 * transparently first) — the caller keeps its existing `!res.ok` error
 * handling untouched. It throws only when every retryable attempt failed at
 * the transport level (network error / timeout) or the caller aborted.
 *
 * Retry observability: every returned `Response` carries a `RetryMeta`
 * (status, parsed `Retry-After`, total retries performed) in a WeakMap.
 * `providerError()` turns a non-ok response into a `ProviderError` that
 * exposes the same metadata, and `carryRetryMeta()` forwards the metadata
 * onto the object an adapter returns (stream / canonical response) so the
 * router can record how many retries a *successful* request went through.
 */

export interface RetryRule {
  /** Number of retries *after* the initial attempt (0 = no retry). */
  attempts: number;
  delayMs: number;
}

/**
 * Per-status retry overrides, keyed by HTTP status code. Merged on top of
 * DEFAULT_RETRY_CONFIG. This is the shape stored per provider record
 * (`providers.retry_config`) and editable from the provider settings UI.
 */
export type RetryConfig = Partial<Record<number, RetryRule>>;

export const DEFAULT_RETRY_CONFIG: Record<number, RetryRule> = {
  429: { attempts: 0, delayMs: 0 },
  502: { attempts: 3, delayMs: 3000 },
  503: { attempts: 3, delayMs: 2000 },
  504: { attempts: 2, delayMs: 3000 },
};

export interface FetchWithRetryOptions {
  /** Used in error messages, e.g. "OpenAI API timeout: ...". */
  providerName: string;
  /** Per-attempt budget to receive response headers. Default 60s. */
  timeoutMs?: number;
  /** Per-status overrides merged on top of DEFAULT_RETRY_CONFIG. */
  retry?: RetryConfig;
  /** Optional caller signal (client disconnect) — propagated, not retried. */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 60_000;

// 9router-style Retry-After support: prefer the server's suggested delay over
// the fixed config. The in-request retry delay is capped so a huge hint can't
// stall the current request (mirrors the antigravity `computeRetryDelay` cap in
// 9router), but the value carried in RetryMeta is the *raw* hint — the router
// uses it to floor the account cooldown, where a long Retry-After is exactly
// the information we want to honor.
const MAX_RETRY_AFTER_MS = 10_000;

// Retry delay jitter: ±25% around the configured delay. Retrying a burst of
// failed requests at identical +3s creates a thundering herd against an
// upstream that is already struggling — jitter spreads the retries out.
function jittered(delayMs: number): number {
  if (delayMs <= 0) return 0;
  const factor = 0.75 + Math.random() * 0.5; // 0.75..1.25
  return Math.round(delayMs * factor);
}

/** Parse a `Retry-After` header to milliseconds, uncapped. */
function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = new Date(header).getTime();
  if (Number.isFinite(dateMs) && dateMs > Date.now()) {
    return dateMs - Date.now();
  }
  return null;
}

function resolveRetryDelayMs(res: Response, fallbackMs: number): number {
  const fromHeader = parseRetryAfterMs(res);
  if (fromHeader !== null) return Math.min(fromHeader, MAX_RETRY_AFTER_MS);
  return jittered(fallbackMs);
}

function resolveRetryRule(
  config: Record<number, RetryRule>,
  status: number,
): RetryRule {
  return config[status] ?? { attempts: 0, delayMs: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Retry observability metadata ---

export interface RetryMeta {
  /** Final HTTP status of the response that returned. */
  status: number;
  /** Parsed `Retry-After` hint (capped at MAX_RETRY_AFTER_MS), or null. */
  retryAfterMs: number | null;
  /** Total retries performed (network + status) before this response. */
  retries: number;
}

const responseMeta = new WeakMap<object, RetryMeta>();

/** Attach retry metadata to a returned object (response, stream, ...). */
export function setRetryMeta(target: object, meta: RetryMeta): void {
  responseMeta.set(target, meta);
}

/** Read retry metadata attached by setRetryMeta/carryRetryMeta, if any. */
export function readRetryMeta(target: unknown): RetryMeta | null {
  if (target && typeof target === "object") {
    return responseMeta.get(target as object) ?? null;
  }
  return null;
}

/** Forward retry metadata from `source` onto `target` (e.g. parsed JSON → stream). */
export function carryRetryMeta<T extends object>(
  target: T,
  source: unknown,
): T {
  const meta = readRetryMeta(source);
  if (meta) responseMeta.set(target, meta);
  return target;
}

/**
 * Error thrown by adapters for a non-ok upstream response. Carries structured
 * metadata (status, Retry-After, retries) so the router can classify the error
 * by status code and size the account cooldown without parsing free text.
 */
export class ProviderError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  readonly retries: number;

  constructor(
    providerName: string,
    status: number,
    text: string,
    retryAfterMs: number | null,
    retries: number,
  ) {
    super(`${providerName} API error ${status}: ${text}`);
    this.name = "ProviderError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.retries = retries;
  }
}

/**
 * Build a `ProviderError` for a non-ok `Response`, pulling retry metadata from
 * the WeakMap that `fetchWithRetry` populated. Keeps the message format
 * identical to the previous `Error("X API error <status>: <text>")` so any
 * string-based matching elsewhere keeps working.
 */
export function providerError(
  providerName: string,
  res: Response,
  text: string,
): ProviderError {
  const meta = readRetryMeta(res);
  return new ProviderError(
    providerName,
    res.status,
    text,
    meta?.retryAfterMs ?? null,
    meta?.retries ?? 0,
  );
}

export async function fetchWithRetry(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: BodyInit },
  opts: FetchWithRetryOptions,
): Promise<Response> {
  const retryConfig: Record<number, RetryRule> = {
    ...DEFAULT_RETRY_CONFIG,
  };
  for (const [status, rule] of Object.entries(opts.retry ?? {})) {
    if (rule != null) retryConfig[Number(status)] = rule;
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Track retries per status bucket so a 502 after a 503 doesn't reset the
  // budget (same bucketing as 9router's retryAttemptsByUrl).
  const attemptsByStatus = new Map<number, number>();
  let totalRetries = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error("fetch connect timeout")),
      timeoutMs,
    );

    const onCallerAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer);
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onCallerAbort);
      // Client disconnect — propagate as-is, never retry.
      if (opts.signal?.aborted) throw err;

      // Network errors / connect timeouts use the 502 retry rule.
      const rule = resolveRetryRule(retryConfig, 502);
      const used = attemptsByStatus.get(502) ?? 0;
      if (used >= rule.attempts) {
        const timedOut = controller.signal.aborted;
        throw new Error(
          timedOut
            ? `${opts.providerName} API timeout: no response from ${url}`
            : `${opts.providerName} API request failed after ${used + 1} attempt(s): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      attemptsByStatus.set(502, used + 1);
      totalRetries++;
      await sleep(jittered(rule.delayMs));
      continue;
    }

    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);

    if (res.ok) {
      setRetryMeta(res, {
        status: res.status,
        retryAfterMs: null,
        retries: totalRetries,
      });
      return res;
    }

    const rule = resolveRetryRule(retryConfig, res.status);
    const used = attemptsByStatus.get(res.status) ?? 0;
    if (used >= rule.attempts) {
      setRetryMeta(res, {
        status: res.status,
        retryAfterMs: parseRetryAfterMs(res),
        retries: totalRetries,
      });
      return res;
    }
    attemptsByStatus.set(res.status, used + 1);
    totalRetries++;
    await sleep(resolveRetryDelayMs(res, rule.delayMs));
  }
}
