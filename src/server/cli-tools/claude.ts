/**
 * Claude Code CLI tool — config at ~/.claude/settings.json
 *
 * Merge strategy: upsert `env` (ANTHROPIC_*) vars into the existing settings,
 * preserve all other settings and env vars. Model role slots (fable / opus /
 * sonnet / haiku) map to their own env var, so Claude Code picks the right
 * routed model per role.
 */

import { existsSync } from "node:fs";
import {
  type CLIToolDefinition,
  commandExists,
  homedirPath,
  readJsonc,
  readJsoncRaw,
  type ToolApplyArgs,
  type ToolStatus,
  writeJson,
} from "./registry";

const BASE_URL_KEY = "ANTHROPIC_BASE_URL";
const AUTH_TOKEN_KEY = "ANTHROPIC_AUTH_TOKEN";
const MODEL_KEY = "ANTHROPIC_MODEL";

// Role slots shown in the form; each maps to its own env key.
// needle is matched (case-insensitive) against model ids when the generic
// multi-select payload is used instead of role slots.
const ROLE_SLOTS = [
  {
    envKey: "ANTHROPIC_DEFAULT_FABLE_MODEL",
    label: "Claude Fable",
    needle: "fable",
    defaultValue: "cc/claude-fable-5",
  },
  {
    envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    label: "Claude Opus",
    needle: "opus",
    defaultValue: "cc/claude-opus-5",
  },
  {
    envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    label: "Claude Sonnet",
    needle: "sonnet",
    defaultValue: "cc/claude-sonnet-5",
  },
  {
    envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    label: "Claude Haiku",
    needle: "haiku",
    defaultValue: "cc/claude-haiku-4-5-20251001",
  },
] as const;

// [needle, env key] pairs for keyword matching in the generic payload path.
const ROLE_KEYS: ReadonlyArray<readonly [string, string]> = ROLE_SLOTS.map(
  (slot) => [slot.needle, slot.envKey],
);

const RESET_ENV_KEYS = [
  BASE_URL_KEY,
  AUTH_TOKEN_KEY,
  MODEL_KEY,
  ...ROLE_SLOTS.map((slot) => slot.envKey),
];

function getConfigPath(): string {
  return homedirPath(".claude", "settings.json");
}

function isInstalled(): boolean {
  return commandExists("claude") || existsSync(getConfigPath());
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed.replace(/\/+$/, "")}/v1`;
}

function read(): ToolStatus {
  const config = readJsonc(getConfigPath());
  const env = (config.env ?? {}) as Record<string, unknown>;

  const roleSlots: Record<string, string> = {};
  const models: string[] = [];
  for (const slot of ROLE_SLOTS) {
    const v = env[slot.envKey];
    if (typeof v === "string" && v) {
      roleSlots[slot.envKey] = v;
      if (!models.includes(v)) models.push(v);
    }
  }

  return {
    installed: isInstalled(),
    configured: Boolean(env[BASE_URL_KEY]),
    details: {
      baseUrl: typeof env[BASE_URL_KEY] === "string" ? env[BASE_URL_KEY] : null,
      apiKey:
        typeof env[AUTH_TOKEN_KEY] === "string" ? env[AUTH_TOKEN_KEY] : null,
      roleSlots,
      models,
      activeModel: typeof env[MODEL_KEY] === "string" ? env[MODEL_KEY] : null,
    },
  };
}

function apply(args: ToolApplyArgs): void {
  const configPath = getConfigPath();
  const raw = readJsoncRaw(configPath);
  const config = readJsonc(configPath);

  // Guard: if the file has content but parsed to empty, it's likely broken
  // JSONC (e.g. trailing commas). Don't write — we'd destroy user settings.
  if (raw && raw.trim().length > 2 && Object.keys(config).length === 0) {
    throw new Error(
      "Gagal parse config claude (syntax error?). Perbaiki file dulu: " +
        configPath,
    );
  }

  const env = (config.env ?? {}) as Record<string, unknown>;

  env[BASE_URL_KEY] = normalizeBaseUrl(args.baseUrl);
  if (args.apiKey) env[AUTH_TOKEN_KEY] = args.apiKey;

  // Role-slot payload (Claude-specific form): write each slot verbatim and
  // drop the generic ANTHROPIC_MODEL so a stale default doesn't linger.
  if (args.roleSlots) {
    delete env[MODEL_KEY];
    for (const slot of ROLE_SLOTS) {
      const value = args.roleSlots[slot.envKey];
      if (value?.trim()) env[slot.envKey] = value.trim();
      else delete env[slot.envKey];
    }
  } else if (args.models && args.models.length > 0) {
    // Generic payload: pick the active model and map the rest by keyword.
    const first = args.models[0];
    const active =
      first && args.activeModel && args.models.includes(args.activeModel)
        ? args.activeModel
        : first;
    if (active) env[MODEL_KEY] = active;

    for (const [, key] of ROLE_KEYS) delete env[key];
    for (const m of args.models) {
      const id = m.toLowerCase();
      for (const [needle, key] of ROLE_KEYS) {
        if (id.includes(needle)) {
          env[key] = m;
          break;
        }
      }
    }
  }

  config.env = env;
  writeJson(configPath, config);
}

function remove(): void {
  const config = readJsonc(getConfigPath());
  const env = config.env as Record<string, unknown> | undefined;
  if (env) {
    for (const key of RESET_ENV_KEYS) delete env[key];
    if (Object.keys(env).length === 0) delete config.env;
    else config.env = env;
  }
  writeJson(getConfigPath(), config);
}

export const claudeTool: CLIToolDefinition = {
  id: "claude",
  name: "Claude Code",
  icon: "/images/providers/claude.svg",
  description: "Anthropic Claude Code CLI",
  form: {
    hideSubagentModel: true,
    roleSlots: ROLE_SLOTS.map((slot) => ({
      envKey: slot.envKey,
      label: slot.label,
      defaultValue: slot.defaultValue,
    })),
  },
  getConfigPath,
  isInstalled,
  read,
  apply,
  remove,
};
