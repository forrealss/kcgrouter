import type { TokenSaverFilterName } from "@/types/token-saver";

/**
 * Per-filter copy. Descriptions state what the filter actually strips — see the
 * `filters` map in src/server/services/token-saver.service.ts. Keep them in sync
 * with that implementation rather than describing the intent loosely.
 */
export const filterDetails: Record<
  TokenSaverFilterName,
  { label: string; description: string; example: string }
> = {
  "git-diff": {
    label: "Git diff",
    description:
      "Drops file, index, and hunk headers, keeping only the changes.",
    example: "diff --git · index a1b2… · @@ …",
  },
  "git-status": {
    label: "Git status",
    description: "Keeps changed paths, drops branch lines and hint text.",
    example: 'On branch main · (use "git add"…)',
  },
  grep: {
    label: "Grep",
    description: "Collapses consecutive identical matches, keeps line numbers.",
    example: "repeated match lines",
  },
  find: {
    label: "Find",
    description: "Strips the directory prefix shared by every result.",
    example: "src/components/… → …",
  },
  ls: {
    label: "List files",
    description: "Reduces listings to bare names, one per line.",
    example: "columns, padding, dotfiles",
  },
  tree: {
    label: "Directory tree",
    description: "Removes the box-drawing characters, keeps the nesting.",
    example: "│ ├── └── ",
  },
  "dedup-log": {
    label: "Deduplicate logs",
    description: "Collapses runs of identical consecutive log lines.",
    example: "repeated stack traces",
  },
  "smart-truncate": {
    label: "Smart truncation",
    description: "Caps every line at 200 characters, appending an ellipsis.",
    example: "very long single lines",
  },
};
