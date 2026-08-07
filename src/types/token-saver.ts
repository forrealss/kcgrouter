export type TokenSaverFilterName =
  | "git-diff"
  | "git-status"
  | "grep"
  | "find"
  | "ls"
  | "tree"
  | "dedup-log"
  | "smart-truncate";

export interface TokenSaverFilter {
  name: TokenSaverFilterName;
  active: boolean;
}

export interface TokenSaverSettings {
  enabled: boolean;
  filters: TokenSaverFilter[];
  cavemanEnabled: boolean;
  cavemanLevel: string;
  ponytailEnabled: boolean;
  ponytailLevel: string;
  totalTokensSaved: number;
  updatedAt: string;
}
