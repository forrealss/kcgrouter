import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { useSseEvent } from "@/lib/sse-bus";
import type { RequestLog } from "@/types/log";

export interface DashboardRetryStats {
  totalRetries: number;
  retriedRequests: number;
  coolingDown: number;
}

export interface DashboardActivity {
  /** Most recent completed requests (success + error), newest first. */
  logs: RequestLog[];
  isLoading: boolean;
  /** Non-null when the log feed could not be loaded. */
  error: string | null;
  stats: DashboardRetryStats | null;
  /** Non-null when router stats could not be loaded. */
  statsError: string | null;
  /** Error rate over the completed-request window, as a percentage (0-100). */
  errorRatePct: number;
  /** Latency percentiles (ms) over the completed-request window. */
  latencyP50: number;
  latencyP95: number;
  /**
   * Number of completed requests the derived stats were computed from — this
   * is the actual denominator, not the raw row count of the fetched window.
   */
  sampleSize: number;
  /** Ids of rows that arrived since the previous render, for enter animations. */
  freshIds: ReadonlySet<string>;
}

const LOG_WINDOW = 200;
/** Coalesce bursts of `log:new` events into one refetch. */
const REFRESH_DEBOUNCE_MS = 400;

/**
 * Live dashboard activity feed + derived router health stats.
 *
 * Sourced from `/api/logs` rather than `/api/usage/history`, because usage
 * records only ever capture successes — errors, account labels, and retry
 * counts only exist in the request log. Refetches are debounced so a burst
 * of traffic doesn't turn into a request storm of its own.
 */
export function useDashboardActivity(): DashboardActivity {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardRetryStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  const seenIdsRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiClient.get<RequestLog[]>(
        `/api/logs?limit=${LOG_WINDOW}`,
      );
      // mark rows we've never rendered before so the table can animate them
      const seen = seenIdsRef.current;
      const fresh = new Set<string>();
      if (seen.size > 0) {
        for (const row of data) if (!seen.has(row.id)) fresh.add(row.id);
      }
      seenIdsRef.current = new Set(data.map((row) => row.id));
      setFreshIds(fresh);
      setLogs(data);
      setError(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiClient.get<DashboardRetryStats>(
        "/api/dashboard/stats",
      );
      setStats(data);
      setStatsError(null);
    } catch (requestError) {
      setStatsError(getApiErrorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void loadLogs();
    void loadStats();
  }, [loadLogs, loadStats]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void loadLogs(false);
      void loadStats();
    }, REFRESH_DEBOUNCE_MS);
  }, [loadLogs, loadStats]);

  const onCooldownChange = useCallback(() => void loadStats(), [loadStats]);

  useSseEvent("log:new", scheduleRefresh);
  useSseEvent("account:cooldown", onCooldownChange);
  useSseEvent("account:recovered", onCooldownChange);

  const completed = useMemo(
    () => logs.filter((l) => l.type === "success" || l.type === "error"),
    [logs],
  );

  const errorRatePct = useMemo(() => {
    if (completed.length === 0) return 0;
    const errors = completed.filter((l) => l.type === "error").length;
    return (errors / completed.length) * 100;
  }, [completed]);

  const { latencyP50, latencyP95 } = useMemo(() => {
    const values = completed
      .map((l) => l.latencyMs)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (values.length === 0) return { latencyP50: 0, latencyP95: 0 };
    const pick = (q: number) =>
      values[Math.min(values.length - 1, Math.floor(values.length * q))] ?? 0;
    return { latencyP50: pick(0.5), latencyP95: pick(0.95) };
  }, [completed]);

  return {
    logs: completed,
    isLoading,
    error,
    stats,
    statsError,
    errorRatePct,
    latencyP50,
    latencyP95,
    sampleSize: completed.length,
    freshIds,
  };
}
