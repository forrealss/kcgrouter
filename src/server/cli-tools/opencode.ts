/**
 * OpenCode CLI tool — config at ~/.config/opencode/opencode.json
 *
 * Merge strategy: upsert `provider.kcgrouter` into existing config,
 * preserve all other providers and settings.
 */

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

function getConfigPath(): string {
  return homedirPath(".config", "opencode", "opencode.json");
}

function isInstalled(): boolean {
  return commandExists("opencode") || existsSync(getConfigPath());
}

function read(): ToolStatus {
  const config = readJsonc(getConfigPath());
  const providers = (config.provider ?? {}) as Record<string, unknown>;
  const provider = providers[PROVIDER_KEY] as
    | {
        options?: { baseURL?: string; apiKey?: string };
        models?: Record<string, unknown>;
      }
    | undefined;

  const models = provider?.models ? Object.keys(provider.models) : [];

  // Subagent model is stored as "kcgrouter/prefix/modelId" under agent.explorer.
  const agent = config.agent as Record<string, unknown> | undefined;
  const explorer = agent?.explorer as Record<string, unknown> | undefined;
  const subagentModel =
    typeof explorer?.model === "string" &&
    explorer.model.startsWith(`${PROVIDER_KEY}/`)
      ? explorer.model.replace(`${PROVIDER_KEY}/`, "")
      : null;

  return {
    installed: isInstalled(),
    configured: !!provider,
    details: {
      baseUrl: provider?.options?.baseURL ?? null,
      apiKey: provider?.options?.apiKey ?? null,
      models,
      activeModel:
        typeof config.model === "string" &&
        config.model.startsWith(`${PROVIDER_KEY}/`)
          ? config.model.replace(`${PROVIDER_KEY}/`, "")
          : null,
      subagentModel,
    },
  };
}

function apply(args: ToolApplyArgs): void {
  const configPath = getConfigPath();
  const raw = readJsoncRaw(configPath);
  const config = readJsonc(configPath);

  // Guard: if the file has content but parsed to empty, it's likely broken
  // JSONC (e.g. double commas). Don't write — we'd destroy other providers.
  if (raw && raw.trim().length > 2 && Object.keys(config).length === 0) {
    throw new Error(
      "Gagal parse config opencode (syntax error?). Perbaiki file dulu: " +
        configPath,
    );
  }

  // Build models object — key is the full "prefix/modelId" string
  const modelsObj: Record<string, unknown> = {};
  for (const m of args.models ?? []) {
    modelsObj[m] = {
      name: m,
      modalities: { input: ["text", "image"], output: ["text"] },
    };
  }

  // Merge kcgrouter into provider — preserve all other providers
  const providers = (config.provider ?? {}) as Record<string, unknown>;
  const existing = (providers[PROVIDER_KEY] ?? {}) as Record<string, unknown>;
  const existingOptions = (existing.options ?? {}) as Record<string, unknown>;

  // apiKey: only touch when explicitly sent — empty string clears the saved key.
  const nextOptions: Record<string, unknown> = {
    ...existingOptions,
    baseURL: args.baseUrl,
  };
  if (args.apiKey !== undefined) {
    if (args.apiKey) nextOptions.apiKey = args.apiKey;
    else delete nextOptions.apiKey;
  }

  providers[PROVIDER_KEY] = {
    ...existing,
    npm: existing.npm ?? "@ai-sdk/openai-compatible",
    options: nextOptions,
    models: modelsObj,
  };
  config.provider = providers;

  // Set active model — format: "kcgrouter/prefix/modelId"
  if (args.models && args.models.length > 0) {
    const active =
      args.activeModel && args.models.includes(args.activeModel)
        ? args.activeModel
        : args.models[0];
    config.model = `${PROVIDER_KEY}/${active}`;
  }

  // Subagent model: only touch when explicitly sent — empty string clears it.
  if (args.subagentModel !== undefined) {
    const agent = (config.agent ?? {}) as Record<string, unknown>;
    const existingAgent = agent.explorer as Record<string, unknown> | undefined;
    if (args.subagentModel) {
      agent.explorer = {
        ...existingAgent,
        model: `${PROVIDER_KEY}/${args.subagentModel}`,
      };
    } else if (existingAgent) {
      delete existingAgent.model;
      if (Object.keys(existingAgent).length === 0) delete agent.explorer;
    }
    config.agent = agent;
  }

  writeJson(configPath, config);
}

function remove(): void {
  const config = readJsonc(getConfigPath());
  const providers = (config.provider ?? {}) as Record<string, unknown>;

  delete providers[PROVIDER_KEY];
  if (Object.keys(providers).length === 0) {
    delete config.provider;
  } else {
    config.provider = providers;
  }

  if (
    typeof config.model === "string" &&
    config.model.startsWith(`${PROVIDER_KEY}/`)
  ) {
    delete config.model;
  }

  const agent = config.agent as Record<string, unknown> | undefined;
  if (agent?.explorer) {
    const explorer = agent.explorer as Record<string, unknown>;
    if (
      typeof explorer.model === "string" &&
      explorer.model.startsWith(`${PROVIDER_KEY}/`)
    ) {
      delete explorer.model;
    }
  }

  writeJson(getConfigPath(), config);
}

import { existsSync } from "node:fs";

export const opencodeTool: CLIToolDefinition = {
  id: "opencode",
  name: "OpenCode",
  icon: "/images/providers/opencode.svg",
  description: "OpenCode AI Terminal Assistant",
  getConfigPath,
  isInstalled,
  read,
  apply,
  remove,
};
