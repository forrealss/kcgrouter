import type { ProviderConfig } from "../types";

export const geminiConfig: ProviderConfig = {
  transport: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  authType: "apikey",
  authHeader: "x-goog-api-key",
};
