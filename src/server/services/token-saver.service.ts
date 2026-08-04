import type { CanonicalMessage } from "../adapters/types";

export type ToolOutputFilterKind =
  | "git-diff"
  | "git-status"
  | "grep"
  | "find"
  | "ls"
  | "tree"
  | "dedup-log"
  | "smart-truncate";

type FilterFn = (content: string) => string;

// --- Filters ---

const filters: Record<ToolOutputFilterKind, FilterFn> = {
  "git-diff": (content) => {
    // Remove file headers, hunk headers unchanged, remove empty lines between hunks
    return content
      .replace(/^diff --git a\/.* b\/.*$/gm, "")
      .replace(/^index [a-f0-9]+\.\.[a-f0-9]+.*$/gm, "")
      .replace(/^--- a\/.*$/gm, "")
      .replace(/^\+\+\+ b\/.*$/gm, "")
      .replace(/^@@.*@@$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  },

  "git-status": (content) => {
    // Compact git status: keep only filenames, remove branch info
    return content
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith("On branch")) return false;
        if (trimmed.startsWith("Changes not staged")) return false;
        if (trimmed.startsWith("Changes to be committed")) return false;
        if (trimmed.startsWith("Untracked files")) return false;
        if (trimmed.startsWith("(use")) return false;
        return true;
      })
      .map((line) => line.trim())
      .join("\n")
      .trim();
  },

  grep: (content) => {
    // Deduplicate consecutive identical grep results, keep line numbers
    const lines = content.split("\n");
    const result: string[] = [];
    let lastLine = "";
    for (const line of lines) {
      if (line !== lastLine) {
        result.push(line);
        lastLine = line;
      }
    }
    return result.join("\n").trim();
  },

  find: (content) => {
    // Remove redundant directory prefixes when all files share a common prefix
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length <= 1) return content;

    // Find common prefix
    const parts = lines.map((l) => l.split("/"));
    let commonLen = 0;
    while (commonLen < (parts[0]?.length ?? 0)) {
      const seg = parts[0]?.[commonLen];
      if (!parts.every((p) => p[commonLen] === seg)) break;
      commonLen++;
    }

    if (commonLen === 0) return content;
    const prefix = `${(parts[0] ?? []).slice(0, commonLen).join("/")}/`;
    return lines
      .map((l) => l.replace(prefix, ""))
      .join("\n")
      .trim();
  },

  ls: (content) => {
    // Compact ls output: just filenames, no extra whitespace
    return content
      .split(/\s+/)
      .filter((w) => w.trim() && !w.startsWith("."))
      .join("\n")
      .trim();
  },

  tree: (content) => {
    // Remove indentation artifacts, keep structure
    return content
      .replace(/[│├└─]+/g, "")
      .replace(/\t+/g, "  ")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim())
      .join("\n")
      .trim();
  },

  "dedup-log": (content) => {
    // Remove consecutive duplicate log lines
    const lines = content.split("\n");
    const result: string[] = [];
    let lastLine = "";
    for (const line of lines) {
      if (line !== lastLine) {
        result.push(line);
        lastLine = line;
      }
    }
    return result.join("\n").trim();
  },

  "smart-truncate": (content) => {
    // Truncate each line to 200 chars max
    return content
      .split("\n")
      .map((l) => (l.length > 200 ? `${l.slice(0, 197)}...` : l))
      .join("\n")
      .trim();
  },
};

export function getSupportedFilters(): ToolOutputFilterKind[] {
  return Object.keys(filters) as ToolOutputFilterKind[];
}

function detectFilter(content: string): ToolOutputFilterKind | null {
  const trimmed = content.trimStart();

  if (
    trimmed.startsWith("diff --git") ||
    trimmed.startsWith("--- a/") ||
    trimmed.startsWith("+++ b/")
  ) {
    return "git-diff";
  }

  if (
    trimmed.includes("On branch ") ||
    trimmed.includes("Changes not staged") ||
    trimmed.includes("Untracked files") ||
    /^\s*(M|A|D|R|C|U)\s+/m.test(trimmed)
  ) {
    return "git-status";
  }

  if (trimmed.match(/^.*:\d+[:].+$/m)) return "grep";
  if (
    trimmed.startsWith("./") ||
    trimmed.split("\n").every((l) => l.includes("/"))
  )
    return "find";

  if (
    trimmed.split("\n").some((l) => /^\s*total\s+\d+/.test(l)) ||
    trimmed.split("\n").every((l) => /^\s*\d/.test(l) || l.includes("  "))
  ) {
    return "ls";
  }

  if (/[│├└─]/.test(trimmed)) return "tree";

  return null;
}

export function compress(
  messages: CanonicalMessage[],
  enabled: boolean,
): {
  messages: CanonicalMessage[];
  tokensSavedEstimate: number;
  filtersApplied: ToolOutputFilterKind[];
} {
  if (!enabled) {
    return { messages, tokensSavedEstimate: 0, filtersApplied: [] };
  }

  const filtersApplied = new Set<ToolOutputFilterKind>();
  let savedChars = 0;

  const result = messages.map((msg) => ({
    ...msg,
    content: msg.content.map((part) => {
      if (part.type !== "tool_result") return part;

      const filter = detectFilter(part.content);
      if (!filter) return part;

      try {
        const filterFn = filters[filter];
        if (!filterFn) return part;
        const compressed = filterFn(part.content);
        if (compressed.length < part.content.length) {
          savedChars += part.content.length - compressed.length;
          filtersApplied.add(filter);
          return { ...part, content: compressed };
        }
        return part;
      } catch {
        return part;
      }
    }),
  }));

  return {
    messages: result,
    tokensSavedEstimate: Math.round(savedChars / 4),
    filtersApplied: Array.from(filtersApplied),
  };
}
