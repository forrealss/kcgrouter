import { run } from "../client";

interface ModelSeed {
  provider: string;
  modelId: string;
  modelName: string;
  contextLength: number;
  maxOutputTokens: number;
}

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

const mimoModels: ModelSeed[] = [
  {
    provider: "builtin-mimo",
    modelId: "mimo-v2.5-pro",
    modelName: "MiMo V2.5 Pro",
    contextLength: 1050000,
    maxOutputTokens: 32768,
  },
  {
    provider: "builtin-mimo",
    modelId: "mimo-v2.5",
    modelName: "MiMo V2.5",
    contextLength: 1050000,
    maxOutputTokens: 32768,
  },
  {
    provider: "builtin-mimo",
    modelId: "mimo-v2-omni",
    modelName: "MiMo V2 Omni",
    contextLength: 1050000,
    maxOutputTokens: 32768,
  },
  {
    provider: "builtin-mimo",
    modelId: "mimo-v2-flash",
    modelName: "MiMo V2 Flash",
    contextLength: 1050000,
    maxOutputTokens: 32768,
  },
];

const allModels = [...kiroModels, ...commandCodeModels, ...mimoModels];

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
