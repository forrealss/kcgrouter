export type ProviderTransport =
  | "openai"
  | "anthropic"
  | "gemini"
  | "kiro"
  | "command-code"
  | "mimo";

export interface Provider {
  id: string;
  name: string;
  transport: ProviderTransport;
  baseUrl: string;
  isBuiltin: boolean;
  prefix: string;
  createdAt: string;
  accountCount: number;
}

export type AccountStatus = "active" | "error" | "expired";
export type QuotaResetType = "5h" | "daily" | "weekly" | "none";

export interface ProviderAccount {
  id: string;
  providerId: string;
  label: string;
  status: AccountStatus;
  quotaResetType: QuotaResetType;
  quotaLimitTokens: number | null;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
}

export interface ProviderFormValues {
  name: string;
  transport: ProviderTransport;
  baseUrl: string;
  prefix: string;
}

export interface AccountFormValues {
  label: string;
  apiKey?: string;
  quotaResetType: QuotaResetType;
  quotaLimitTokens: number | null;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  contextLength: number | null;
  maxOutputTokens: number | null;
  enabled: boolean;
  createdAt: string;
}
