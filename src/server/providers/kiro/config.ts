import type { ProviderConfig } from "../types";

export const kiroConfig: ProviderConfig = {
  transport: "kiro",
  baseUrl: "https://codewhisperer.us-east-1.amazonaws.com",
  authType: "apikey",
  authHeader: "Authorization",
  defaultHeaders: {
    "Content-Type": "application/json",
    Accept: "application/vnd.amazon.eventstream",
    "X-Amz-Target":
      "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
    "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
    "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
  },
};
