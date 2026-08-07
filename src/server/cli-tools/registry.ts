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
}

export interface CLIToolDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
  const dir = filePath.slice(0, filePath.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function commandExists(cmd: string): boolean {
  try {
    const proc = Bun.spawnSync(["which", cmd]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export function homedirPath(...segments: string[]): string {
  return join(homedir(), ...segments);
}
