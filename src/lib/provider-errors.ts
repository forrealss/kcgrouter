import type { ProviderAccount } from "@/types/provider";

export interface AccountErrorSummary {
  message: string;
  at: string | null;
}

/**
 * Returns the most recent error recorded across the given accounts, or
 * null when no account has a recorded error.
 */
export function getLatestAccountError(
  accounts: ProviderAccount[],
): AccountErrorSummary | null {
  const latest = accounts
    .filter((account) => account.lastError)
    .sort(
      (a, b) =>
        (b.lastErrorAt ? new Date(b.lastErrorAt).getTime() : 0) -
        (a.lastErrorAt ? new Date(a.lastErrorAt).getTime() : 0),
    )[0];
  return latest?.lastError
    ? { message: latest.lastError, at: latest.lastErrorAt }
    : null;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
