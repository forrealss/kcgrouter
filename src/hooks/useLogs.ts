import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { useSseEvent, useSseStatus } from "@/lib/sse-bus";
import type {
  ConnectionStatus,
  LogsStats,
  PayloadData,
  RequestLog,
  RequestLogSource,
  RequestLogType,
} from "@/types/log";

export function useLogs() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const loadRequestId = useRef(0);

  const [typeFilter, setTypeFilter] = useState<"all" | RequestLogType>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | RequestLogSource>(
    "all",
  );
  const [accountFilter, setAccountFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);
  const [payloads, setPayloads] = useState<PayloadData | null>(null);
  const [isPayloadLoading, setIsPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [payloadPending, setPayloadPending] = useState(false);
  const payloadRequestId = useRef(0);

  const loadLogs = useCallback(async (showLoading = true) => {
    const requestId = ++loadRequestId.current;
    if (showLoading) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const response = await apiClient.get<RequestLog[]>("/api/logs?limit=200");
      if (requestId !== loadRequestId.current) return;
      setLogs(response);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (requestId === loadRequestId.current && showLoading) {
        setError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === loadRequestId.current && showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const onLogNew = useCallback(() => {
    setLiveAnnouncement(
      `New log entry received at ${new Date().toLocaleTimeString("en-US")}.`,
    );
    void loadLogs(false);
  }, [loadLogs]);

  const onAccountCooldown = useCallback(
    (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          message?: string;
          errorKind?: string;
          cooldownMs?: number;
        };
        const kind = data.errorKind ?? "error";
        const seconds = Math.round((data.cooldownMs ?? 0) / 1000);
        setLiveAnnouncement(
          `Account cooling down (${kind}) for ${seconds}s: ${data.message ?? ""}`,
        );
      } catch {
        // ignore malformed frames
      }
      void loadLogs(false);
    },
    [loadLogs],
  );

  const onAccountRecovered = useCallback(() => {
    setLiveAnnouncement(
      `Account cooldown expired at ${new Date().toLocaleTimeString("en-US")}.`,
    );
    void loadLogs(false);
  }, [loadLogs]);

  useSseEvent("log:new", onLogNew);
  useSseEvent("account:cooldown", onAccountCooldown);
  useSseEvent("account:recovered", onAccountRecovered);

  const sseStatus = useSseStatus();
  useEffect(() => {
    setConnectionStatus(sseStatus);
  }, [sseStatus]);

  async function handleOpenLog(log: RequestLog) {
    if (log.type !== "request" && log.type !== "success") return;

    const requestId = ++payloadRequestId.current;
    setSelectedLog(log);
    setPayloads(null);
    setPayloadError(null);
    setPayloadPending(false);
    setIsPayloadLoading(true);
    try {
      const response = await apiClient.get<PayloadData>(
        `/api/logs/${encodeURIComponent(log.id)}/payloads`,
      );
      if (requestId === payloadRequestId.current) {
        setPayloads(response);
        setPayloadPending(!response.requestBody && !response.responseBody);
      }
    } catch (requestError) {
      if (requestId === payloadRequestId.current) {
        setPayloadError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === payloadRequestId.current) setIsPayloadLoading(false);
    }
  }

  function handleLogKeyDown(event: KeyboardEvent, log: RequestLog) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void handleOpenLog(log);
    }
  }

  function closeLog() {
    payloadRequestId.current += 1;
    setSelectedLog(null);
    setPayloadPending(false);
    setIsPayloadLoading(false);
  }

  async function handleClearLogs() {
    setIsClearing(true);
    try {
      await apiClient.delete("/api/logs");
      setLogs([]);
      setLastUpdated(new Date());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsClearing(false);
    }
  }

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const log of logs) {
      if (log.providerAccountId && log.accountLabel) {
        seen.set(log.providerAccountId, log.accountLabel);
      }
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (typeFilter !== "all" && log.type !== typeFilter) return false;
      if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
      if (accountFilter !== "all" && log.providerAccountId !== accountFilter)
        return false;
      if (
        query &&
        ![
          log.message,
          log.model,
          log.providerName,
          log.accountLabel,
          log.source,
          log.type,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  }, [logs, typeFilter, sourceFilter, accountFilter, searchQuery]);

  const stats = useMemo<LogsStats>(() => {
    const latencyValues = logs.flatMap((log) =>
      log.latencyMs == null ? [] : [log.latencyMs],
    );
    return {
      errors: logs.filter((log) => log.type === "error").length,
      successes: logs.filter((log) => log.type === "success").length,
      averageLatency: latencyValues.length
        ? Math.round(
            latencyValues.reduce((sum, value) => sum + value, 0) /
              latencyValues.length,
          )
        : null,
    };
  }, [logs]);

  const hasActiveFilters =
    typeFilter !== "all" ||
    sourceFilter !== "all" ||
    accountFilter !== "all" ||
    searchQuery.trim() !== "";

  function resetFilters() {
    setTypeFilter("all");
    setSourceFilter("all");
    setAccountFilter("all");
    setSearchQuery("");
  }

  return {
    logs,
    isLoading,
    error,
    isClearing,
    connectionStatus,
    lastUpdated,
    liveAnnouncement,
    typeFilter,
    setTypeFilter,
    sourceFilter,
    setSourceFilter,
    accountFilter,
    setAccountFilter,
    searchQuery,
    setSearchQuery,
    selectedLog,
    payloads,
    isPayloadLoading,
    payloadError,
    payloadPending,
    accountOptions,
    filteredLogs,
    stats,
    hasActiveFilters,
    loadLogs,
    handleOpenLog,
    handleLogKeyDown,
    handleClearLogs,
    closeLog,
    resetFilters,
  };
}
