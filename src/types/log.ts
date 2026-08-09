export type RequestLogType = "request" | "success" | "error" | "admin";
export type RequestLogSource = "router" | "test" | "admin";

export interface RequestLog {
  id: string;
  timestamp: string;
  type: RequestLogType;
  source: RequestLogSource;
  providerAccountId: string | null;
  comboId: string | null;
  model: string | null;
  sourceFormat: string | null;
  stream: boolean;
  message: string | null;
  latencyMs: number | null;
  accountLabel: string | null;
  providerId: string | null;
  providerName: string | null;
  requestId?: string | null;
}
