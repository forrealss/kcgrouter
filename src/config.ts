import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Values persisted to ~/.kcgrouter/config.json */
export interface AppConfig {
  /** Custom HTTP port for the server (defaults to 3000). */
  port?: number;
  /** App version last recorded at startup (used to detect upgrades). */
  version?: string;
}

export const DEFAULT_PORT = 3000;
export const CONFIG_FILE = "config.json";

/** Resolve the KCG Router home directory (~/.kcgrouter unless overridden). */
export function getHome(): string {
  return process.env.KCGRouter_HOME || join(homedir(), ".kcgrouter");
}

/** Full path to the config file. */
export function getConfigPath(): string {
  return join(getHome(), CONFIG_FILE);
}

/** Read the config file; returns {} if missing or invalid JSON. */
export function loadConfig(): AppConfig {
  try {
    const parsed = JSON.parse(
      readFileSync(getConfigPath(), "utf-8"),
    ) as AppConfig;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {
    // missing or malformed config — fall back to defaults
  }
  return {};
}

/** True if the value is a valid TCP port number (1–65535). */
export function isValidPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

/**
 * The port persisted in config.json, or undefined if not set/valid.
 * Does not consider the PORT env var or the default.
 */
export function getConfiguredPort(): number | undefined {
  const configPort = loadConfig().port;
  return isValidPort(configPort) ? configPort : undefined;
}

/**
 * Resolve the effective port with the following priority:
 * 1. PORT env var (explicit override)
 * 2. port from config.json
 * 3. DEFAULT_PORT
 */
export function getPort(): number {
  const envPort = Number(process.env.PORT);
  if (isValidPort(envPort)) return envPort;
  return getConfiguredPort() ?? DEFAULT_PORT;
}

/**
 * The port the server process itself should bind to (`src/index.ts`).
 *
 * In dev mode (`bun dev`) the persisted config.json port is intentionally
 * ignored — only the PORT env var (or the default) applies, so a saved port
 * never hijacks local development. In production mode (`bun start`, daemon,
 * tray) the config.json port is honored as the effective runtime port.
 */
export function getServerPort(): number {
  const envPort = Number(process.env.PORT);
  if (isValidPort(envPort)) return envPort;
  if (process.env.NODE_ENV === "production") {
    return getConfiguredPort() ?? DEFAULT_PORT;
  }
  return DEFAULT_PORT;
}

/** Merge partial config into config.json and persist it. */
export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  mkdirSync(getHome(), { recursive: true });
  const next = { ...loadConfig(), ...partial };
  writeFileSync(getConfigPath(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/**
 * The running app version read from package.json ("0.0.0" when unreadable).
 * Used on startup to detect that an upgrade just happened.
 */
export function getAppVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Version last recorded in config.json (undefined when never recorded). */
export function getRecordedVersion(): string | undefined {
  return loadConfig().version;
}

/** Persist a version to config.json (defaults to the running app version). */
export function recordVersion(version: string = getAppVersion()): string {
  saveConfig({ version });
  return version;
}
