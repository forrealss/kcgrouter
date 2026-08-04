import type { TokenSaverFilterName } from "@/types/token-saver";

export const filterDetails: Record<
  TokenSaverFilterName,
  { label: string; description: string }
> = {
  "git-diff": {
    label: "Git diff",
    description: "Reduces repeated diff output.",
  },
  "git-status": {
    label: "Git status",
    description: "Condenses repository status output.",
  },
  grep: {
    label: "Grep",
    description: "Trims repeated search results.",
  },
  find: {
    label: "Find",
    description: "Limits redundant file matches.",
  },
  ls: {
    label: "List files",
    description: "Condenses directory listings.",
  },
  tree: {
    label: "Directory tree",
    description: "Truncates large tree output.",
  },
  "dedup-log": {
    label: "Deduplicate logs",
    description: "Removes duplicate log lines.",
  },
  "smart-truncate": {
    label: "Smart truncation",
    description: "Keeps the most useful portion of long output.",
  },
};
