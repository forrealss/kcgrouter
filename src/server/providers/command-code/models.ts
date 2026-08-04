import type { ModelInfo } from "../types";

export const commandCodeModels: ModelInfo[] = [
  {
    id: "xiaomi/mimo-v2.5-pro",
    name: "Mimo V2.5 Pro",
    contextLength: 1_000_000,
    maxOutputTokens: 131_072,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextLength: 1_000_000,
    maxOutputTokens: 131_072,
  },
  {
    id: "moonshotai/Kimi-K3",
    name: "Kimi K3",
    contextLength: 256_000,
    maxOutputTokens: 65_536,
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    name: "MiniMax M3",
    contextLength: 256_000,
    maxOutputTokens: 65_536,
  },
  {
    id: "zai-org/GLM-5.2",
    name: "GLM-5.2",
    contextLength: 200_000,
    maxOutputTokens: 32_000,
  },
  {
    id: "Qwen/Qwen3.8-Max",
    name: "Qwen3.8-Max",
    contextLength: 200_000,
    maxOutputTokens: 32_000,
  },
];
