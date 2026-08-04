import type { ModelInfo } from "../types";

export const openaiModels: ModelInfo[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    contextLength: 128_000,
    maxOutputTokens: 16_384,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    contextLength: 128_000,
    maxOutputTokens: 16_384,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    contextLength: 1_048_576,
    maxOutputTokens: 32_768,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    contextLength: 1_048_576,
    maxOutputTokens: 32_768,
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    contextLength: 1_048_576,
    maxOutputTokens: 32_768,
  },
  { id: "o3", name: "o3", contextLength: 200_000, maxOutputTokens: 100_000 },
  {
    id: "o3-mini",
    name: "o3-mini",
    contextLength: 200_000,
    maxOutputTokens: 100_000,
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    contextLength: 200_000,
    maxOutputTokens: 100_000,
  },
];
