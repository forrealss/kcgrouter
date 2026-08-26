import {
  CheckCircle2Icon,
  CircleSlashIcon,
  type LucideIcon,
  PlugZapIcon,
  TimerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ProviderAccount } from "@/types/provider";

/**
 * Health of a provider as a whole, derived from its connections. Kept separate
 * from the per-account status so the page can describe "some keys work, some
 * don't" instead of collapsing it to a single account state.
 */
export type ProviderHealth =
  | "online"
  | "degraded"
  | "error"
  | "expired"
  | "unconfigured";

export interface StatusMeta {
  label: string;
  /** Glowing indicator dot. */
  dot: string;
  /** Foreground colour for the label. */
  text: string;
  icon: LucideIcon;
}

export const providerHealthMeta: Record<ProviderHealth, StatusMeta> = {
  online: {
    label: "Online",
    dot: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2Icon,
  },
  degraded: {
    label: "Degraded",
    dot: "bg-amber-500 shadow-[0_0_6px] shadow-amber-500/70",
    text: "text-amber-600 dark:text-amber-400",
    icon: TriangleAlertIcon,
  },
  error: {
    label: "Failing",
    dot: "bg-destructive shadow-[0_0_6px] shadow-destructive/70",
    text: "text-destructive",
    icon: TriangleAlertIcon,
  },
  expired: {
    label: "Expired",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    icon: CircleSlashIcon,
  },
  unconfigured: {
    label: "No credentials",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    icon: PlugZapIcon,
  },
};

/** Per-connection status, including the synthetic "cooldown" state. */
export type AccountStatusKey = "active" | "error" | "expired" | "cooldown";

export const accountStatusMeta: Record<AccountStatusKey, StatusMeta> = {
  active: {
    label: "Active",
    dot: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2Icon,
  },
  error: {
    label: "Failing",
    dot: "bg-destructive shadow-[0_0_6px] shadow-destructive/70",
    text: "text-destructive",
    icon: TriangleAlertIcon,
  },
  expired: {
    label: "Expired",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    icon: CircleSlashIcon,
  },
  cooldown: {
    label: "Cooling down",
    dot: "bg-amber-500 shadow-[0_0_6px] shadow-amber-500/70",
    text: "text-amber-600 dark:text-amber-400",
    icon: TimerIcon,
  },
};

export function resolveProviderHealth(
  accounts: ProviderAccount[],
): ProviderHealth {
  if (accounts.length === 0) return "unconfigured";
  const hasActive = accounts.some((account) => account.status === "active");
  const hasError = accounts.some((account) => account.status === "error");
  if (hasActive && hasError) return "degraded";
  if (hasError) return "error";
  if (hasActive) return "online";
  if (accounts.every((account) => account.status === "expired")) {
    return "expired";
  }
  return "unconfigured";
}

/** Remaining cooldown in seconds, or 0 when the account is not cooling down. */
export function cooldownRemainingSeconds(cooldownUntil: string | null): number {
  if (!cooldownUntil) return 0;
  const ms = new Date(cooldownUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

export function resolveAccountStatus(
  account: ProviderAccount,
): AccountStatusKey {
  return cooldownRemainingSeconds(account.cooldownUntil) > 0
    ? "cooldown"
    : account.status;
}
