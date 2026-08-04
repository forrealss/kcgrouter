import type { ModelInfo } from "../types";

export const kiroModels: ModelInfo[] = [
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    contextLength: 1_000_000,
    maxOutputTokens: 128_000,
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "deepseek-3.2",
    name: "DeepSeek V3.2",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "minimax-m2.5",
    name: "MiniMax M2.5",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "minimax-m2.1",
    name: "MiniMax M2.1",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "glm-5",
    name: "GLM-5",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "qwen3-coder-next",
    name: "Qwen3 Coder Next",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    contextLength: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    contextLength: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    contextLength: 272_000,
    maxOutputTokens: 128_000,
  },
];
