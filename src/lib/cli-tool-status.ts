import {
  CheckCircle2Icon,
  CircleSlashIcon,
  type LucideIcon,
  PlugZapIcon,
} from "lucide-react";

/**
 * The state of a CLI tool, derived from the two independent flags the server
 * reports. `installed` and `configured` do not imply one another: a tool can
 * carry router config while its binary is gone (Cowork's `isInstalled()` only
 * probes install directories, not the config path).
 *
 * Kept in one place so the list card and the detail header can never describe
 * the same tool differently — they previously disagreed, because the list keyed
 * off `configured` alone while the detail header required `installed &&
 * configured`.
 */
export type CLIToolState = "connected" | "needsSetup" | "orphaned" | "absent";

export interface CLIToolStateMeta {
  label: string;
  /** What the user can do next, not a restatement of the label. */
  hint: string;
  icon: LucideIcon;
  /** Glowing status dot. */
  dot: string;
  /** Foreground colour for the label. */
  text: string;
  /** Left-edge accent so state reads without parsing the badge. */
  edge: string;
}

export const cliToolStateMeta: Record<CLIToolState, CLIToolStateMeta> = {
  connected: {
    label: "Connected",
    hint: "Routing through kcgrouter",
    icon: CheckCircle2Icon,
    dot: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
    edge: "before:bg-emerald-500/70",
  },
  needsSetup: {
    label: "Needs setup",
    hint: "Installed — not pointed here yet",
    icon: PlugZapIcon,
    dot: "bg-amber-500 shadow-[0_0_6px] shadow-amber-500/70",
    text: "text-amber-600 dark:text-amber-400",
    edge: "before:bg-amber-500/70",
  },
  orphaned: {
    label: "Config only",
    hint: "Configured, but no install found",
    icon: PlugZapIcon,
    dot: "bg-amber-500 shadow-[0_0_6px] shadow-amber-500/70",
    text: "text-amber-600 dark:text-amber-400",
    edge: "before:bg-amber-500/70",
  },
  absent: {
    label: "Not detected",
    hint: "No installation found",
    icon: CircleSlashIcon,
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    edge: "before:bg-transparent",
  },
};

export function resolveCLIToolState(flags: {
  installed: boolean;
  configured: boolean;
}): CLIToolState {
  if (flags.configured) {
    return flags.installed ? "connected" : "orphaned";
  }
  return flags.installed ? "needsSetup" : "absent";
}

/** Whether this state means the tool is actually usable right now. */
export function isCLIToolLive(state: CLIToolState): boolean {
  return state === "connected";
}
