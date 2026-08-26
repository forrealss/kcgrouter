import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { useSseEvent } from "@/lib/sse-bus";
import type { UsageSummary } from "@/types/usage";

export interface GraphProvider {
  id: string;
  name: string;
  transport: string;
}

export interface GraphNode {
  id: string;
  label: string;
  sub: string;
  transport: string;
  requestCount: number;
  totalTokens: number;
  angle: number;
  color: string;
}

export interface RealtimeRequest {
  providerAccountId: string;
  comboId: string | null;
  model: string;
  transport: string;
  latencyMs: number;
  timestamp: number;
}

export interface UseUsageGraphResult {
  nodes: GraphNode[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  onRequest: (cb: (req: RealtimeRequest) => void) => () => void;
}

const TRANSPORT_COLOR: Record<string, string> = {
  openai: "#10b981",
  anthropic: "#e07a5f",
  gemini: "#4f8cff",
  kiro: "#a855f7",
  "command-code": "#22d3ee",
};

const TRANSPORT_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  kiro: "Kiro",
  "command-code": "Command Code",
};

function fmtReq(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M req`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k req`;
  return `${n} req`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tok`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k tok`;
  return `${n} tok`;
}

function buildNodes(
  summary: UsageSummary,
  providers: GraphProvider[],
  accountTransportMap: Map<string, string>,
  connectedTransports: Set<string>,
): GraphNode[] {
  // aggregate stats per transport from usage data
  const byTransport = new Map<
    string,
    { requestCount: number; totalTokens: number }
  >();
  for (const pu of summary.byProvider) {
    const transport = accountTransportMap.get(pu.providerAccountId);
    if (!transport) continue;
    const existing = byTransport.get(transport);
    if (existing) {
      existing.requestCount += pu.requestCount;
      existing.totalTokens += pu.inputTokens + pu.outputTokens;
    } else {
      byTransport.set(transport, {
        requestCount: pu.requestCount,
        totalTokens: pu.inputTokens + pu.outputTokens,
      });
    }
  }

  // build provider nodes from connected transports only
  const activeTransports = [...connectedTransports];
  const total = activeTransports.length;
  const STEP = 360 / total;

  return activeTransports.map((transport, i) => {
    const stats = byTransport.get(transport);
    const requestCount = stats?.requestCount ?? 0;
    const totalTokens = stats?.totalTokens ?? 0;
    const providerName =
      providers.find((p) => p.transport === transport)?.name ??
      TRANSPORT_LABELS[transport] ??
      transport;
    return {
      id: transport,
      label: providerName,
      sub:
        requestCount > 0
          ? `${fmtReq(requestCount)} · ${fmtTokens(totalTokens)}`
          : "no usage yet",
      transport,
      requestCount,
      totalTokens,
      angle: -90 + i * STEP,
      color: TRANSPORT_COLOR[transport] ?? "#888",
    };
  });
}

export function useUsageGraph(): UseUsageGraphResult {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accountTransportMapRef = useRef<Map<string, string>>(new Map());
  const requestCallbacksRef = useRef<Set<(req: RealtimeRequest) => void>>(
    new Set(),
  );
  const providersRef = useRef<GraphProvider[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, providers] = await Promise.all([
        apiClient.get<UsageSummary>("/api/usage/summary"),
        apiClient.get<GraphProvider[]>("/api/providers"),
      ]);

      // fetch accounts per provider, only track ACTIVE ones
      const accountTransportMap = new Map<string, string>();
      const connectedTransports = new Set<string>();

      await Promise.all(
        providers.map(async (p) => {
          try {
            const accts = await apiClient.get<{ id: string; status: string }[]>(
              `/api/providers/${encodeURIComponent(p.id)}/accounts`,
            );
            for (const a of accts) {
              if (a.status === "active") {
                accountTransportMap.set(a.id, p.transport);
                connectedTransports.add(p.transport);
              }
            }
          } catch {
            // ignore
          }
        }),
      );

      accountTransportMapRef.current = accountTransportMap;
      providersRef.current = providers;

      setNodes(
        buildNodes(
          summary,
          providers,
          accountTransportMap,
          connectedTransports,
        ),
      );
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time events, via the shared SSE connection so the dashboard doesn't
  // hold several subscriptions to the same stream.
  const onRequestComplete = useCallback((e: MessageEvent) => {
    try {
      const data: RealtimeRequest = JSON.parse(e.data);

      // update nodes state optimistically
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === data.transport) {
            return {
              ...n,
              requestCount: n.requestCount + 1,
              sub: `${fmtReq(n.requestCount + 1)} · ${fmtTokens(n.totalTokens)}`,
            };
          }
          return n;
        }),
      );

      // notify all registered callbacks
      for (const cb of requestCallbacksRef.current) {
        cb(data);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useSseEvent("request:complete", onRequestComplete);

  const onRequest = useCallback(
    (cb: (req: RealtimeRequest) => void): (() => void) => {
      requestCallbacksRef.current.add(cb);
      return () => {
        requestCallbacksRef.current.delete(cb);
      };
    },
    [],
  );

  return { nodes, loading, error, reload: load, onRequest };
}
