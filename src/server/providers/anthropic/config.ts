import type { ProviderConfig } from "../types";

export const anthropicConfig: ProviderConfig = {
  transport: "anthropic",
  baseUrl: "https://api.anthropic.com",
  authType: "apikey",
  authHeader: "x-api-key",
  defaultHeaders: {
    "anthropic-version": "2023-06-01",
  },
};
