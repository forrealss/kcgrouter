import type { ProviderConfig } from "../types";

export const openaiConfig: ProviderConfig = {
  transport: "openai",
  baseUrl: "https://api.openai.com/v1",
  authType: "apikey",
  authHeader: "Authorization",
};
