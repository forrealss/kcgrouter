import { run } from "../client";

interface ModelSeed {
  provider: string;
  modelId: string;
  modelName: string;
  contextLength: number;
  maxOutputTokens: number;
}

const openaiModels: ModelSeed[] = [
  {
    provider: "builtin-openai",
    modelId: "gpt-4o",
    modelName: "GPT-4o",
    contextLength: 128000,
    maxOutputTokens: 16384,
  },
  {
    provider: "builtin-openai",
    modelId: "gpt-4o-mini",
    modelName: "GPT-4o Mini",
    contextLength: 128000,
    maxOutputTokens: 16384,
  },
  {
    provider: "builtin-openai",
    modelId: "gpt-4.1",
    modelName: "GPT-4.1",
    contextLength: 1048576,
    maxOutputTokens: 32768,
  },
  {
    provider: "builtin-openai",
    modelId: "gpt-4.1-mini",
    modelName: "GPT-4.1 Mini",
    contextLength: 1048576,
    maxOutputTokens: 32768,
  },
  {
    provider: "builtin-openai",
    modelId: "gpt-4.1-nano",
    modelName: "GPT-4.1 Nano",
    contextLength: 1048576,
    maxOutputTokens: 32768,
  },
  {
    provider: "builtin-openai",
    modelId: "o3",
    modelName: "o3",
    contextLength: 200000,
    maxOutputTokens: 100000,
  },
  {
    provider: "builtin-openai",
    modelId: "o3-mini",
    modelName: "o3-mini",
    contextLength: 200000,
    maxOutputTokens: 100000,
  },
  {
    provider: "builtin-openai",
    modelId: "o4-mini",
    modelName: "o4-mini",
    contextLength: 200000,
    maxOutputTokens: 100000,
  },
];

const anthropicModels: ModelSeed[] = [
  {
    provider: "builtin-anthropic",
    modelId: "claude-sonnet-4-20250514",
    modelName: "Claude Sonnet 4",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-anthropic",
    modelId: "claude-haiku-4-20250514",
    modelName: "Claude Haiku 4",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    modelName: "Claude 3.5 Sonnet",
    contextLength: 200000,
    maxOutputTokens: 8192,
  },
  {
    provider: "builtin-anthropic",
    modelId: "claude-3-5-haiku-20241022",
    modelName: "Claude 3.5 Haiku",
    contextLength: 200000,
    maxOutputTokens: 8192,
  },
];

const geminiModels: ModelSeed[] = [
  {
    provider: "builtin-gemini",
    modelId: "gemini-2.5-pro",
    modelName: "Gemini 2.5 Pro",
    contextLength: 1048576,
    maxOutputTokens: 65536,
  },
  {
    provider: "builtin-gemini",
    modelId: "gemini-2.5-flash",
    modelName: "Gemini 2.5 Flash",
    contextLength: 1048576,
    maxOutputTokens: 65536,
  },
  {
    provider: "builtin-gemini",
    modelId: "gemini-2.0-flash",
    modelName: "Gemini 2.0 Flash",
    contextLength: 1048576,
    maxOutputTokens: 8192,
  },
  {
    provider: "builtin-gemini",
    modelId: "gemini-1.5-pro",
    modelName: "Gemini 1.5 Pro",
    contextLength: 2097152,
    maxOutputTokens: 8192,
  },
  {
    provider: "builtin-gemini",
    modelId: "gemini-1.5-flash",
    modelName: "Gemini 1.5 Flash",
    contextLength: 1048576,
    maxOutputTokens: 8192,
  },
];

const kiroModels: ModelSeed[] = [
  {
    provider: "builtin-kiro",
    modelId: "claude-sonnet-5",
    modelName: "Claude Sonnet 5",
    contextLength: 1000000,
    maxOutputTokens: 128000,
  },
  {
    provider: "builtin-kiro",
    modelId: "claude-sonnet-4.5",
    modelName: "Claude Sonnet 4.5",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-kiro",
    modelId: "claude-haiku-4.5",
    modelName: "Claude Haiku 4.5",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-kiro",
    modelId: "deepseek-3.2",
    modelName: "DeepSeek V3.2",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-kiro",
    modelId: "minimax-m2.5",
    modelName: "MiniMax M2.5",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-kiro",
    modelId: "glm-5",
    modelName: "GLM-5",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-kiro",
    modelId: "qwen3-coder-next",
    modelName: "Qwen3 Coder Next",
    contextLength: 200000,
    maxOutputTokens: 64000,
  },
  {
    provider: "builtin-kiro",
    modelId: "gpt-5.6-sol",
    modelName: "GPT-5.6 Sol",
    contextLength: 272000,
    maxOutputTokens: 128000,
  },
  {
    provider: "builtin-kiro",
    modelId: "gpt-5.6-terra",
    modelName: "GPT-5.6 Terra",
    contextLength: 272000,
    maxOutputTokens: 128000,
  },
  {
    provider: "builtin-kiro",
    modelId: "gpt-5.6-luna",
    modelName: "GPT-5.6 Luna",
    contextLength: 272000,
    maxOutputTokens: 128000,
  },
];

const commandCodeModels: ModelSeed[] = [
  {
    provider: "builtin-command-code",
    modelId: "xiaomi/mimo-v2.5-pro",
    modelName: "Mimo V2.5 Pro",
    contextLength: 1000000,
    maxOutputTokens: 131072,
  },
  {
    provider: "builtin-command-code",
    modelId: "deepseek/deepseek-v4-pro",
    modelName: "DeepSeek V4 Pro",
    contextLength: 1000000,
    maxOutputTokens: 131072,
  },
  {
    provider: "builtin-command-code",
    modelId: "moonshotai/Kimi-K3",
    modelName: "Kimi K3",
    contextLength: 256000,
    maxOutputTokens: 65536,
  },
  {
    provider: "builtin-command-code",
    modelId: "MiniMaxAI/MiniMax-M3",
    modelName: "MiniMax M3",
    contextLength: 256000,
    maxOutputTokens: 65536,
  },
  {
    provider: "builtin-command-code",
    modelId: "zai-org/GLM-5.2",
    modelName: "GLM-5.2",
    contextLength: 200000,
    maxOutputTokens: 32000,
  },
  {
    provider: "builtin-command-code",
    modelId: "Qwen/Qwen3.8-Max",
    modelName: "Qwen3.8-Max",
    contextLength: 200000,
    maxOutputTokens: 32000,
  },
];

const allModels = [
  ...openaiModels,
  ...anthropicModels,
  ...geminiModels,
  ...kiroModels,
  ...commandCodeModels,
];

export function seed(): void {
  for (const m of allModels) {
    run(
      `INSERT OR IGNORE INTO provider_models (id, provider_id, model_id, model_name, context_length, max_output_tokens, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      `pm-${m.provider}-${m.modelId}`,
      m.provider,
      m.modelId,
      m.modelName,
      m.contextLength,
      m.maxOutputTokens,
    );
  }
}
