import type { ModelInfo } from "../types";

export const mimoModels: ModelInfo[] = [
  {
    id: "mimo-v2.5-pro",
    name: "MiMo V2.5 Pro",
    contextLength: 1_050_000,
    maxOutputTokens: 32_768,
  },
  {
    id: "mimo-v2.5",
    name: "MiMo V2.5",
    contextLength: 1_050_000,
    maxOutputTokens: 32_768,
  },
  {
    id: "mimo-v2-omni",
    name: "MiMo V2 Omni",
    contextLength: 1_050_000,
    maxOutputTokens: 32_768,
  },
  {
    id: "mimo-v2-flash",
    name: "MiMo V2 Flash",
    contextLength: 1_050_000,
    maxOutputTokens: 32_768,
  },
];
