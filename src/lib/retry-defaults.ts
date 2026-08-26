import type { RetryRule } from "@/types/provider";

/**
 * Status codes the retry policy covers, mirroring DEFAULT_RETRY_CONFIG in
 * src/server/providers/retry.ts. Kept as one client-side source so the retry
 * card and the editor dialog can never disagree about the defaults.
 */
export interface RetryStatusMeta {
  status: number;
  reason: string;
  /** Why this status behaves the way it does by default. */
  note: string;
  fallback: RetryRule;
}

export const RETRY_STATUSES: readonly RetryStatusMeta[] = [
  {
    status: 429,
    reason: "Rate limited",
    note: "Falls over to the next connection instead of retrying in place.",
    fallback: { attempts: 0, delayMs: 0 },
  },
  {
    status: 502,
    reason: "Bad gateway",
    note: "Also covers network errors and connect timeouts.",
    fallback: { attempts: 3, delayMs: 3000 },
  },
  {
    status: 503,
    reason: "Unavailable",
    note: "Upstream is temporarily refusing traffic.",
    fallback: { attempts: 3, delayMs: 2000 },
  },
  {
    status: 504,
    reason: "Gateway timeout",
    note: "Upstream accepted the request but never answered.",
    fallback: { attempts: 2, delayMs: 3000 },
  },
] as const;

/** Human-readable summary of a rule, e.g. "3 retries · 3s apart". */
export function formatRetryRule(attempts: number, delayMs: number): string {
  if (attempts === 0) return "No retry · fail over";
  const seconds = delayMs / 1000;
  const delay = seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1);
  return `${attempts} ${attempts === 1 ? "retry" : "retries"} · ${delay}s apart`;
}

/** Worst-case added latency before the request gives up on this status. */
export function formatWorstCase(attempts: number, delayMs: number): string {
  if (attempts === 0) return "no added delay";
  const total = (attempts * delayMs) / 1000;
  const value = total % 1 === 0 ? total.toFixed(0) : total.toFixed(1);
  return `up to ~${value}s added`;
}
