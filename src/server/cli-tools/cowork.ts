/**
 * Claude Cowork tool — Claude Desktop third-party inference config.
 *
 * Writes `inferenceProvider: "gateway"` config into Claude Desktop's
 * configLibrary (3p mode). Config paths vary by OS:
 *   macOS   ~/Library/Application Support/Claude-3p/configLibrary/
 *   Windows %LOCALAPPDATA%\Claude-3p\configLibrary\  (also roaming, Claude)
 *   Linux   ~/.config/Claude-3p/configLibrary/       (also ~/.config/Claude)
 *
 * The active config file is <appliedId>.json, where appliedId lives in
 * `_meta.json` next to it. Model roles are stored as inferenceModels.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type CLIToolDefinition,
  homedirPath,
  readJsonc,
  type ToolApplyArgs,
  type ToolStatus,
  writeJson,
} from "./registry";

const PROVIDER = "gateway";
const META_FILE = "_meta.json";

function getCandidateRoots(): string[] {
  if (process.platform === "darwin") {
    const base = join(homedirPath(), "Library", "Application Support");
    return [join(base, "Claude-3p"), join(base, "Claude")];
  }
  if (process.platform === "win32") {
    const localApp =
      process.env.LOCALAPPDATA ?? join(homedirPath(), "AppData", "Local");
    const roaming =
      process.env.APPDATA ?? join(homedirPath(), "AppData", "Roaming");
    return [
      join(localApp, "Claude-3p"),
      join(roaming, "Claude-3p"),
      join(localApp, "Claude"),
      join(roaming, "Claude"),
    ];
  }
  return [
    homedirPath(".config", "Claude-3p"),
    homedirPath(".config", "Claude"),
  ];
}

function getAppInstallPaths(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications/Claude.app",
      join(homedirPath(), "Applications", "Claude.app"),
    ];
  }
  if (process.platform === "win32") {
    const localApp =
      process.env.LOCALAPPDATA ?? join(homedirPath(), "AppData", "Local");
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    return [
      join(localApp, "AnthropicClaude"),
      join(programFiles, "Claude"),
      join(programFiles, "AnthropicClaude"),
    ];
  }
  return [];
}

/**
 * Single root used for BOTH reading and writing, so `_meta.json` and the
 * `<appliedId>.json` config always live in the same configLibrary.
 * Prefers the primary (Claude-3p) root; falls back to a legacy root that
 * already has a configLibrary (e.g. 1p Claude Desktop), then to the primary.
 */
function getConfigRoot(): string {
  const writeRoot =
    getCandidateRoots()[0] ?? homedirPath(".config", "Claude-3p");
  if (existsSync(join(writeRoot, "configLibrary"))) return writeRoot;
  const roots = getCandidateRoots();
  for (const dir of roots) {
    if (existsSync(join(dir, "configLibrary"))) return dir;
  }
  return writeRoot;
}

function getConfigDir(): string {
  return join(getConfigRoot(), "configLibrary");
}

/** 1p Claude Desktop config — used to enable 3p (Cowork) mode. */
function get1pConfigPath(): string {
  if (process.platform === "darwin") {
    return join(
      homedirPath(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (process.platform === "win32") {
    const roaming =
      process.env.APPDATA ?? join(homedirPath(), "AppData", "Roaming");
    return join(roaming, "Claude", "claude_desktop_config.json");
  }
  return homedirPath(".config", "Claude", "claude_desktop_config.json");
}

/**
 * Best-effort: mark Claude Desktop as running in 3p (third-party inference)
 * mode so it reads our configLibrary entry. Mirrors 9router's bootstrap.
 */
function bootstrapDeploymentMode(): boolean {
  const configPath = get1pConfigPath();
  const config = readJsonc(configPath);
  if (config.deploymentMode === "3p") return false;
  config.deploymentMode = "3p";
  writeJson(configPath, config);
  return true;
}

function getMetaPath(): string {
  return join(getConfigDir(), META_FILE);
}

function getConfigPath(): string {
  const meta = readJsonc(getMetaPath());
  const appliedId = typeof meta.appliedId === "string" ? meta.appliedId : null;
  return join(getConfigDir(), `${appliedId ?? "default"}.json`);
}

function isInstalled(): boolean {
  for (const dir of [...getCandidateRoots(), ...getAppInstallPaths()]) {
    if (existsSync(dir)) return true;
  }
  return false;
}

function read(): ToolStatus {
  const meta = readJsonc(getMetaPath());
  const appliedId = typeof meta.appliedId === "string" ? meta.appliedId : null;
  const config = appliedId
    ? readJsonc(join(getConfigDir(), `${appliedId}.json`))
    : {};

  const baseUrl =
    typeof config.inferenceGatewayBaseUrl === "string"
      ? config.inferenceGatewayBaseUrl
      : null;
  const models = Array.isArray(config.inferenceModels)
    ? config.inferenceModels
        .map((m) =>
          typeof m === "string" ? m : (m as { name?: unknown })?.name,
        )
        .filter((m): m is string => typeof m === "string" && m.length > 0)
    : [];

  return {
    installed: isInstalled(),
    configured: config.inferenceProvider === PROVIDER && Boolean(baseUrl),
    details: { baseUrl, models, activeModel: null },
  };
}

function apply(args: ToolApplyArgs): void {
  if (!args.apiKey) {
    throw new Error(
      "Claude Cowork memerlukan API key. Pilih key atau isi manual.",
    );
  }
  const models = (args.models ?? []).filter((m) => m.trim().length > 0);
  if (models.length === 0) {
    throw new Error("Pilih minimal satu model untuk Claude Cowork.");
  }

  const metaPath = getMetaPath();
  let meta = readJsonc(metaPath);
  if (typeof meta.appliedId !== "string") {
    const newId = randomUUID();
    meta = { appliedId: newId, entries: [{ id: newId, name: "Default" }] };
  }

  const appliedId = meta.appliedId;
  const configPath = join(getConfigDir(), `${appliedId}.json`);

  const newConfig: Record<string, unknown> = {
    inferenceProvider: PROVIDER,
    inferenceGatewayBaseUrl: args.baseUrl,
    inferenceGatewayApiKey: args.apiKey,
    inferenceModels: models.map((name) => ({ name })),
  };

  writeJson(configPath, newConfig);
  writeJson(metaPath, meta);

  try {
    bootstrapDeploymentMode();
  } catch {
    // Best-effort — a locked/missing 1p config must not block applying.
  }
}

function remove(): void {
  const meta = readJsonc(getMetaPath());
  const appliedId = typeof meta.appliedId === "string" ? meta.appliedId : null;
  if (!appliedId) return;
  const configPath = join(getConfigDir(), `${appliedId}.json`);
  if (existsSync(configPath)) writeJson(configPath, {});
}

export const coworkTool: CLIToolDefinition = {
  id: "cowork",
  name: "Claude Cowork",
  icon: "/images/providers/claude.svg",
  description: "Claude Desktop Cowork (third-party inference)",
  form: {
    hideSubagentModel: true,
  },
  getConfigPath,
  isInstalled,
  read,
  apply,
  remove,
};
