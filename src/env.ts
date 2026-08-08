import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHome } from "./config";

const SECRETS_FILE_NAME = ".env";

/** Full path to the app secrets file (~/.kcgrouter/.env). */
export function getSecretsFile(): string {
  return join(getHome(), SECRETS_FILE_NAME);
}

/**
 * Load a simple KEY=VALUE file into process.env without overriding values
 * that are already set (real environment vars and Bun's own .env loading
 * always win).
 */
function loadSecretsFile(path: string): void {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return; // missing/unreadable — nothing to load
  }
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Bootstrap secrets for the app.
 *
 * 1. Loads ~/.kcgrouter/.env (if present) — existing environment variables
 *    (e.g. from the shell or the project .env) take precedence.
 * 2. If ENCRYPTION_KEY / SESSION_SECRET are still missing, generates them,
 *    persists them to ~/.kcgrouter/.env (mode 0600) and applies them to the
 *    current process.
 *
 * Safe to call multiple times: once generated, it is a no-op.
 */
function collectMissing(): Record<string, string> {
  const missing: Record<string, string> = {};
  if (!process.env.ENCRYPTION_KEY) {
    missing.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  }
  if (!process.env.SESSION_SECRET) {
    missing.SESSION_SECRET = randomBytes(32).toString("hex");
  }
  return missing;
}

export function ensureSecrets(): void {
  const secretsFile = getSecretsFile();
  loadSecretsFile(secretsFile);

  let missing = collectMissing();
  if (Object.keys(missing).length === 0) return;

  mkdirSync(getHome(), { recursive: true });

  // Re-load right before writing: another process (e.g. dev server + daemon
  // on first run) may have created the file in the meantime — adopt its keys
  // instead of racing to write our own.
  loadSecretsFile(secretsFile);
  missing = collectMissing();
  if (Object.keys(missing).length === 0) return;

  // Preserve any existing keys in the file, append only what is missing.
  const lines: string[] = [];
  try {
    const existing = readFileSync(secretsFile, "utf-8").trim();
    if (existing)
      lines.push(...existing.split("\n").filter((l) => l.trim() !== ""));
  } catch {
    // no file yet
  }
  const present = new Set(lines.map((l) => l.slice(0, l.indexOf("=")).trim()));
  for (const [key, value] of Object.entries(missing)) {
    if (!present.has(key)) lines.push(`${key}=${value}`);
    process.env[key] = value;
  }

  writeFileSync(secretsFile, `${lines.join("\n")}\n`, { mode: 0o600 });
  try {
    chmodSync(secretsFile, 0o600);
  } catch {
    // non-POSIX (Windows) — chmod is a no-op there
  }
}
