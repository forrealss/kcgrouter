export type ProviderTransport =
  | "openai"
  | "anthropic"
  | "gemini"
  | "kiro"
  | "command-code"
  | "mimo"
  | "qoder"
  | "antigravity";

export interface RetryRule {
  /** Number of retries *after* the first attempt (0 = no retry). */
  attempts: number;
  /** Delay before each retry, in milliseconds. */
  delayMs: number;
}

/** Per-status retry policy, keyed by HTTP status code. */
export type RetryConfig = Partial<Record<number, RetryRule>>;

export interface Provider {
  id: string;
  name: string;
  transport: ProviderTransport;
  baseUrl: string;
  isBuiltin: boolean;
  prefix: string;
  /** Per-status retry policy, or null to use the global defaults. */
  retryConfig: RetryConfig | null;
  createdAt: string;
  accountCount: number;
}

export type AccountStatus = "active" | "error" | "expired";

export interface ProviderAccount {
  id: string;
  providerId: string;
  label: string;
  status: AccountStatus;
  /**
   * Whether the operator has this connection switched on.
   *
   * Independent of `status`: a disabled connection is skipped for routing no
   * matter how healthy it looks, and re-enabling it does not clear an error.
   */
  enabled: boolean;
  /** Failover position within the provider — index 0 is tried first. */
  sortOrder: number;
  quotaLimitTokens: number | null;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** ISO timestamp; while in the future the account is auto-skipped. */
  cooldownUntil: string | null;
  /** Exponential-backoff level for repeated rate limits. */
  backoffLevel: number;
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
  quotaLimitTokens: number | null;
  /** Antigravity OAuth login result (set by the OAuth login dialog flow). */
  oauth?: AntigravityOAuthInput | null;
}

/**
 * Result of a completed Antigravity OAuth login, as delivered by the
 * /oauth/wait endpoint and forwarded to the account create/update endpoint.
 * The server persists the refresh token encrypted and keeps the access token
 * in the regular credential slot.
 */
export interface AntigravityOAuthResult {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (Google default: 3599). */
  expiresIn?: number;
  email?: string;
  projectId?: string;
}

/** OAuth data attached to an account create/update API call. */
export interface AntigravityOAuthInput {
  refreshToken: string;
  expiresIn?: number;
  email?: string;
  projectId?: string;
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

/** A model fetched from an upstream catalog, shown in the import dialog. */
export interface ModelCandidate {
  modelId: string;
  modelName: string;
  /** Whether this model is already registered for the provider. */
  exists: boolean;
  contextLength?: number;
  maxOutputTokens?: number;
}
