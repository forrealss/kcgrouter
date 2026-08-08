export interface CLIToolSummary {
  name: string;
  icon: string;
  description: string;
  installed: boolean;
  configured: boolean;
}

export interface CLIToolDetails {
  installed: boolean;
  configured: boolean;
  configPath: string;
  details?: {
    baseUrl?: string | null;
    models?: string[] | null;
    activeModel?: string | null;
  };
}

export interface CLIToolApplyPayload {
  baseUrl: string;
  apiKey?: string;
  models?: string[];
  activeModel?: string;
  subagentModel?: string;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  has_key: boolean;
}
