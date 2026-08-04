import type { ModelInfo } from "../types";

export const geminiModels: ModelInfo[] = [
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    contextLength: 1_048_576,
    maxOutputTokens: 65_536,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    contextLength: 1_048_576,
    maxOutputTokens: 65_536,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    contextLength: 1_048_576,
    maxOutputTokens: 8_192,
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    contextLength: 2_097_152,
    maxOutputTokens: 8_192,
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    contextLength: 1_048_576,
    maxOutputTokens: 8_192,
  },
];
