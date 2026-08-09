export interface CLIToolSummary {
  name: string;
  icon: string;
  description: string;
  installed: boolean;
  configured: boolean;
}

/** A named model role (e.g. "Claude Opus") mapped to an env key. */
export interface CLIToolRoleSlot {
  /** Env key that stores the model for this role. */
  envKey: string;
  /** Display label shown in the form. */
  label: string;
  /** Fallback model id when the user leaves the slot empty. */
  defaultValue?: string;
}

/** Per-tool UI hints so the generic config form adapts to each tool. */
export interface CLIToolFormConfig {
  /** Hide the generic subagent-model field. */
  hideSubagentModel?: boolean;
  /**
   * Where the tool expects the router base URL to point. "root" means the
   * client appends /v1 itself (Claude Code / Cowork), so the base URL is
   * just the origin. Defaults to "v1" (OpenAI-style clients such as
   * OpenCode, which call {baseUrl}/chat/completions).
   */
  baseUrlStyle?: "root" | "v1";
  /**
   * When set, render one model picker per role slot instead of the generic
   * multi-select; values are keyed by env key in apply/read.
   */
  roleSlots?: CLIToolRoleSlot[];
}

export interface CLIToolDetails {
  installed: boolean;
  configured: boolean;
  configPath: string;
  form?: CLIToolFormConfig;
  details?: {
    baseUrl?: string | null;
    apiKey?: string | null;
    models?: string[] | null;
    activeModel?: string | null;
    subagentModel?: string | null;
    /** Role-slot model values keyed by env key (e.g. Claude Code roles). */
    roleSlots?: Record<string, string>;
  };
}

export interface CLIToolApplyPayload {
  baseUrl: string;
  apiKey?: string;
  models?: string[];
  activeModel?: string;
  subagentModel?: string;
  /** Role-slot model values keyed by env key (e.g. Claude Code roles). */
  roleSlots?: Record<string, string>;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  has_key: boolean;
}
