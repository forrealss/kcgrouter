/** Shared formatting + small pure helpers for the dashboard page. */

export const numFmt = new Intl.NumberFormat("en-US");

/** Compact number formatting, e.g. 8421337 -> "8.42M", 1204882 -> "1.20M". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return numFmt.format(n);
}

/** Human-relative "Xs ago" / "Xm ago" / never, from an ISO timestamp. */
export function formatAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Remaining cooldown in seconds, or 0 when the account isn't cooling down. */
export function cooldownRemainingSeconds(cooldownUntil: string | null): number {
  if (!cooldownUntil) return 0;
  const ms = new Date(cooldownUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}
