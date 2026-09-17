import type { ProviderConfig } from "../types";

/**
 * Antigravity talks to Google's Cloud Code IDE endpoint — the same backend the
 * Antigravity IDE uses. Requests are Gemini-shaped bodies wrapped in an
 * Antigravity envelope ({project, model, userAgent, requestType, requestId,
 * request}) and authenticated with a Google OAuth access token.
 */
export const antigravityConfig: ProviderConfig = {
  transport: "antigravity",
  baseUrl: "https://daily-cloudcode-pa.googleapis.com",
  authType: "oauth",
  authHeader: "Authorization",
  defaultHeaders: {
    "Content-Type": "application/json",
    "User-Agent": "antigravity/ide/2.11.0 darwin/arm64",
  },
};
