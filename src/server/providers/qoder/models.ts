import type { ModelInfo } from "../types";

// Static defaults mirroring 9router's qoder provider registry. The live
// catalog (COSY-signed /algo/api/v2/model/list) is authoritative at request
// time; these only seed the UI + "default models" endpoint.
export const qoderModels: ModelInfo[] = [
  {
    id: "ultimate",
    name: "Ultimate",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  { id: "auto", name: "Auto", contextLength: 131_072, maxOutputTokens: 32_768 },
  {
    id: "performance",
    name: "Performance",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "efficient",
    name: "Efficient",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "qmodel_preview",
    name: "Qwen3.8-Max-Preview",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "qmodel_latest",
    name: "Qwen3.7-Max",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "qmodel",
    name: "Qwen3.7-Plus",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "kmodel_latest",
    name: "Kimi-K3",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "kmodel",
    name: "Kimi-K2.7-Code",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "gm51model",
    name: "GLM-5.2",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "dmodel",
    name: "DeepSeek-V4-Pro",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "dfmodel",
    name: "DeepSeek-V4-Flash",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
  {
    id: "mmodel",
    name: "MiniMax-M3",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
];
