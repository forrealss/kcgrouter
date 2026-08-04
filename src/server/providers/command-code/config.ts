import type { ProviderConfig } from "../types";

export const commandCodeConfig: ProviderConfig = {
  transport: "command-code",
  baseUrl: "https://api.commandcode.ai",
  authType: "apikey",
  authHeader: "Authorization",
  defaultHeaders: {
    "x-command-code-version": "0.25.7",
    "x-cli-environment": "cli",
    "x-project-slug": "pi-cc",
    "x-taste-learning": "false",
    "x-co-flag": "false",
  },
};
