import {
  CheckCircle2Icon,
  CircleSlashIcon,
  type LucideIcon,
  PlugZapIcon,
  PowerOffIcon,
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
    dot: "bg-success shadow-[0_0_6px] shadow-success/70",
    text: "text-success",
    icon: CheckCircle2Icon,
  },
  degraded: {
    label: "Degraded",
    dot: "bg-warning shadow-[0_0_6px] shadow-warning/70",
    text: "text-warning",
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

/**
 * Per-connection status, including the synthetic "cooldown" and "disabled"
 * states. Neither is a value of the stored `status` column: cooldown is derived
 * from `cooldownUntil`, and disabled from the separate `enabled` flag.
 */
export type AccountStatusKey =
  | "active"
  | "error"
  | "expired"
  | "cooldown"
  | "disabled";

export const accountStatusMeta: Record<AccountStatusKey, StatusMeta> = {
  active: {
    label: "Active",
    dot: "bg-success shadow-[0_0_6px] shadow-success/70",
    text: "text-success",
    icon: CheckCircle2Icon,
  },
  disabled: {
    label: "Disabled",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    icon: PowerOffIcon,
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
    dot: "bg-warning shadow-[0_0_6px] shadow-warning/70",
    text: "text-warning",
    icon: TimerIcon,
  },
};

export function resolveProviderHealth(
  accounts: ProviderAccount[],
): ProviderHealth {
  if (accounts.length === 0) return "unconfigured";

  // A disabled connection serves no traffic, so it cannot make the provider
  // look online. Judge health on the ones actually in rotation, and report a
  // provider whose every connection is switched off as unconfigured rather
  // than healthy.
  const inRotation = accounts.filter((account) => account.enabled);
  if (inRotation.length === 0) return "unconfigured";

  const hasActive = inRotation.some((account) => account.status === "active");
  const hasError = inRotation.some((account) => account.status === "error");
  if (hasActive && hasError) return "degraded";
  if (hasError) return "error";
  if (hasActive) return "online";
  if (inRotation.every((account) => account.status === "expired")) {
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
  // Disabled outranks everything else: it is the reason the connection is out
  // of rotation, and showing "Cooling down" for a switched-off connection would
  // suggest it is about to come back on its own.
  if (!account.enabled) return "disabled";
  return cooldownRemainingSeconds(account.cooldownUntil) > 0
    ? "cooldown"
    : account.status;
}
