/**
 * Compact token-window label, e.g. `128K` or `1M`.
 *
 * Rolls over just below the next unit (999.5K) so rounding can never produce a
 * nonsense label like "1000K" — a 1M-context model must not read as 1000K.
 */
export function formatTokenWindow(tokens: number): string {
  if (tokens >= 999_500) {
    const millions = tokens / 1_000_000;
    return `${millions.toFixed(millions >= 10 ? 0 : 1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return String(tokens);
}

/** Token window with a trailing noun, for use on its own in a badge. */
export function formatContextLabel(tokens: number): string {
  return `${formatTokenWindow(tokens)} context`;
}
