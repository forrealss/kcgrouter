/**
 * Pi CLI tool — custom provider config at ~/.pi/agent/models.json, with the
 * active model set via ~/.pi/agent/settings.json (defaultProvider /
 * defaultModel). See https://pi.dev/docs/latest/models.
 *
 * Merge strategy: upsert `providers.kcgrouter` into models.json, preserve
 * all other providers.
 */

import { existsSync } from "node:fs";
import { getModelByProviderAndModelId } from "../services/model-registry.service";
import { getProviderByPrefix } from "../services/provider-registry.service";
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

const PROVIDER_KEY = "kcgrouter";

interface PiModelEntry {
  id: string;
  contextWindow?: number;
  maxTokens?: number;
}

/**
 * Look up the real context window / max output tokens for a routed model
 * selector (e.g. "cc/claude-sonnet-5"), so Pi's models.json doesn't fall
 * back to its small defaults (128000 / 16384) — that would trigger constant
 * auto-compaction on models the router actually serves with a much larger
 * window (e.g. a 1M-token Sonnet).
 *
 * Combo selectors (no "/" prefix) have no single fixed model, so they are
 * left unenriched and keep Pi's defaults.
 */
function resolveModelLimits(
  selector: string,
): { contextWindow?: number; maxTokens?: number } | null {
  const slashIndex = selector.indexOf("/");
  if (slashIndex === -1) return null;

  const prefix = selector.slice(0, slashIndex);
  const modelId = selector.slice(slashIndex + 1);

  try {
    const provider = getProviderByPrefix(prefix);
    if (!provider) return null;

    const model = getModelByProviderAndModelId(provider.id, modelId);
    if (!model) return null;

    return {
      contextWindow: model.contextLength ?? undefined,
      maxTokens: model.maxOutputTokens ?? undefined,
    };
  } catch {
    // DB unavailable or lookup failed — fall back to Pi's own defaults
    // rather than blocking the whole apply().
    return null;
  }
}

function buildModelEntry(id: string): PiModelEntry {
  const limits = resolveModelLimits(id);
  return {
    id,
    contextWindow: limits?.contextWindow,
    maxTokens: limits?.maxTokens,
  };
}

interface PiProviderConfig {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: PiModelEntry[];
}

function getModelsConfigPath(): string {
  return homedirPath(".pi", "agent", "models.json");
}

function getSettingsConfigPath(): string {
  return homedirPath(".pi", "agent", "settings.json");
}

function getConfigPath(): string {
  return getModelsConfigPath();
}

function isInstalled(): boolean {
  return commandExists("pi") || existsSync(getModelsConfigPath());
}

function read(): ToolStatus {
  const modelsConfig = readJsonc(getModelsConfigPath());
  const providers = (modelsConfig.providers ?? {}) as Record<string, unknown>;
  const provider = providers[PROVIDER_KEY] as PiProviderConfig | undefined;

  const models = (provider?.models ?? []).map((m) => m.id);

  const settings = readJsonc(getSettingsConfigPath());
  const activeModel =
    settings.defaultProvider === PROVIDER_KEY &&
    typeof settings.defaultModel === "string"
      ? settings.defaultModel
      : null;

  return {
    installed: isInstalled(),
    configured: !!provider,
    details: {
      baseUrl: provider?.baseUrl ?? null,
      apiKey: provider?.apiKey ?? null,
      models,
      activeModel,
    },
  };
}

function apply(args: ToolApplyArgs): void {
  const modelsPath = getModelsConfigPath();
  const rawModels = readJsoncRaw(modelsPath);
  const modelsConfig = readJsonc(modelsPath);

  // Guard: if the file has content but parsed to empty, it's likely broken
  // JSON. Don't write — we'd destroy other providers.
  if (
    rawModels &&
    rawModels.trim().length > 2 &&
    Object.keys(modelsConfig).length === 0
  ) {
    throw new Error(
      "Gagal parse config pi (syntax error?). Perbaiki file dulu: " +
        modelsPath,
    );
  }

  const providers = (modelsConfig.providers ?? {}) as Record<string, unknown>;
  const existing = (providers[PROVIDER_KEY] ?? {}) as PiProviderConfig;

  const nextProvider: PiProviderConfig = {
    ...existing,
    baseUrl: args.baseUrl,
    api: existing.api ?? "openai-completions",
    models: (args.models ?? []).map(buildModelEntry),
  };

  // apiKey: only touch when explicitly sent — empty string clears the saved key.
  if (args.apiKey !== undefined) {
    if (args.apiKey) nextProvider.apiKey = args.apiKey;
    else delete nextProvider.apiKey;
  }

  providers[PROVIDER_KEY] = nextProvider;
  modelsConfig.providers = providers;
  writeJson(modelsPath, modelsConfig);

  // Set the startup default provider/model so Pi starts pointed at the
  // router. Only touched when at least one model is being configured.
  if (args.models && args.models.length > 0) {
    const settingsPath = getSettingsConfigPath();
    const rawSettings = readJsoncRaw(settingsPath);
    const settings = readJsonc(settingsPath);

    if (
      rawSettings &&
      rawSettings.trim().length > 2 &&
      Object.keys(settings).length === 0
    ) {
      throw new Error(
        "Gagal parse settings pi (syntax error?). Perbaiki file dulu: " +
          settingsPath,
      );
    }

    const active =
      args.activeModel && args.models.includes(args.activeModel)
        ? args.activeModel
        : args.models[0];

    settings.defaultProvider = PROVIDER_KEY;
    settings.defaultModel = active;
    writeJson(settingsPath, settings);
  }
}

function remove(): void {
  const modelsPath = getModelsConfigPath();
  const modelsConfig = readJsonc(modelsPath);
  const providers = (modelsConfig.providers ?? {}) as Record<string, unknown>;

  delete providers[PROVIDER_KEY];
  if (Object.keys(providers).length === 0) delete modelsConfig.providers;
  else modelsConfig.providers = providers;
  writeJson(modelsPath, modelsConfig);

  const settingsPath = getSettingsConfigPath();
  const settings = readJsonc(settingsPath);
  if (settings.defaultProvider === PROVIDER_KEY) {
    delete settings.defaultProvider;
    delete settings.defaultModel;
    writeJson(settingsPath, settings);
  }
}

export const piTool: CLIToolDefinition = {
  id: "pi",
  name: "Pi",
  icon: "/images/providers/pi.svg",
  darkIcon: "/images/providers/pi-dark.svg",
  description: "Pi Coding Agent CLI",
  form: {
    hideSubagentModel: true,
  },
  getConfigPath,
  isInstalled,
  read,
  apply,
  remove,
};
