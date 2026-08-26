import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { UsageSummary } from "@/types/usage";

export interface UseUsageSummaryResult {
  summary: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Just the usage summary, nothing else.
 *
 * The fuller `useUsage` hook also re-fetches the provider list and every
 * provider's accounts purely to build display labels. On the dashboard that
 * data is already loaded via `useProviders`, so this avoids duplicating a
 * fan-out of requests on every visit.
 */
export function useUsageSummary(): UseUsageSummaryResult {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<UsageSummary>("/api/usage/summary");
      setSummary(data);
      setError(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { summary, isLoading, error, reload: load };
}
