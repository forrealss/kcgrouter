import type { ModelInfo } from "../types";

export const anthropicModels: ModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "claude-haiku-4-20250514",
    name: "Claude Haiku 4",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    contextLength: 200_000,
    maxOutputTokens: 8_192,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    contextLength: 200_000,
    maxOutputTokens: 8_192,
  },
];
