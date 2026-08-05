import type { ProviderTransport } from "../../db/schema";
import {
  anthropicAdapter,
  anthropicConfig,
  anthropicModels,
} from "./anthropic";
import {
  commandCodeAdapter,
  commandCodeConfig,
  commandCodeModels,
} from "./command-code";
import { geminiAdapter, geminiConfig, geminiModels } from "./gemini";
import { kiroAdapter, kiroConfig, kiroModels } from "./kiro";
import { mimoAdapter, mimoConfig, mimoModels } from "./mimo";
import { openaiAdapter, openaiConfig, openaiModels } from "./openai";
import type { ModelInfo, ProviderAdapter, ProviderConfig } from "./types";

const adapters: Record<ProviderTransport, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  kiro: kiroAdapter,
  "command-code": commandCodeAdapter,
  mimo: mimoAdapter,
};

const configs: Record<ProviderTransport, ProviderConfig> = {
  openai: openaiConfig,
  anthropic: anthropicConfig,
  gemini: geminiConfig,
  kiro: kiroConfig,
  "command-code": commandCodeConfig,
  mimo: mimoConfig,
};

const models: Record<ProviderTransport, ModelInfo[]> = {
  openai: openaiModels,
  anthropic: anthropicModels,
  gemini: geminiModels,
  kiro: kiroModels,
  "command-code": commandCodeModels,
  mimo: mimoModels,
};

export function getAdapter(transport: ProviderTransport): ProviderAdapter {
  return adapters[transport];
}

export function getConfig(transport: ProviderTransport): ProviderConfig {
  return configs[transport];
}

export function getDefaultModels(transport: ProviderTransport): ModelInfo[] {
  return models[transport] ?? [];
}

export function getModelById(
  transport: ProviderTransport,
  modelId: string,
): ModelInfo | undefined {
  return models[transport]?.find((m) => m.id === modelId);
}

export function getAllTransports(): ProviderTransport[] {
  return Object.keys(adapters) as ProviderTransport[];
}
