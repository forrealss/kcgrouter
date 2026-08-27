/**
 * CLI Tool registry — each tool defines how to read/apply/remove its config.
 * To add a new tool, append an entry to `cliTools` below.
 */

export interface ToolStatus {
  installed: boolean;
  configured: boolean;
  details?: Record<string, unknown>;
}

export interface ToolApplyArgs {
  baseUrl: string;
  apiKey?: string;
  models?: string[];
  activeModel?: string;
  subagentModel?: string;
  /** Role-slot model values keyed by env key (e.g. Claude Code roles). */
  roleSlots?: Record<string, string>;
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

/** Per-tool UI hints so the generic form adapts to each tool. */
export interface CLIToolFormConfig {
  /** Hide the generic subagent-model field. */
  hideSubagentModel?: boolean;
  /**
   * Where the tool expects the router base URL to point. "root" means the
   * client appends the API path itself (Claude Code / Cowork append /v1), so
   * the base URL is just the origin. Defaults to "v1" (OpenAI-style clients
   * such as OpenCode, which call {baseUrl}/chat/completions).
   */
  baseUrlStyle?: "root" | "v1";
  /**
   * When set, render one model picker per role slot instead of the generic
   * multi-select; values are keyed by env key in apply/read.
   */
  roleSlots?: CLIToolRoleSlot[];
}

export interface CLIToolDefinition {
  id: string;
  name: string;
  icon: string;
  darkIcon?: string;
  description: string;
  /** Per-tool UI hints for the generic config form. */
  form?: CLIToolFormConfig;
  /** Returns the config file path for display */
  getConfigPath(): string;
  /** Check if the CLI is installed on this machine */
  isInstalled(): boolean;
  /** Read current config and return status */
  read(): ToolStatus;
  /** Merge/apply provider config into the tool's config file */
  apply(args: ToolApplyArgs): void;
  /** Remove provider config from the tool's config file */
  remove(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import * as jsonc from "jsonc-parser";

export function readJsonc(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, "utf-8");
    const errors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) return {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function readJsoncRaw(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

export function writeJson(
  filePath: string,
  data: Record<string, unknown>,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const WINDOWS_EXECUTABLE_EXTS = [".exe", ".cmd", ".bat", ".com", ""];

/**
 * Check whether a command is available on PATH.
 *
 * On Windows we scan PATH directly instead of spawning `which`/`where`:
 * spawning a subprocess (even hidden) is slower and, without
 * `windowsHide`, briefly flashes a console window every time a page
 * checks tool status. Path segments are checked with statSync so
 * directories are never mistaken for executables.
 */
export function commandExists(cmd: string): boolean {
  if (process.platform === "win32") {
    const pathDirs = (process.env.PATH ?? "").split(delimiter);
    for (const dir of pathDirs) {
      if (!dir) continue;
      for (const ext of WINDOWS_EXECUTABLE_EXTS) {
        const fullPath = join(dir, cmd + ext);
        try {
          if (statSync(fullPath).isFile()) return true;
        } catch {
          // missing or unreadable segment — keep scanning
        }
      }
    }
    return false;
  }

  try {
    const proc = Bun.spawnSync(["which", cmd], {
      windowsHide: true,
      stdout: "ignore",
      stderr: "ignore",
    });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export function homedirPath(...segments: string[]): string {
  return join(homedir(), ...segments);
}

/**
 * Normalize a router base URL for clients that append the API path
 * themselves (Claude Code / Cowork): drop trailing slashes and a trailing
 * /v1 so the stored value points at the router root.
 */
export function normalizeRouterBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}
