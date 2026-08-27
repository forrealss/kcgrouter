import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { BucketGranularity, UsageBucket } from "@/types/usage";

export interface UsageTimeseriesRange {
  from: string;
  to: string;
}

/**
 * Day/hour usage buckets for the trend chart. Sends the browser's timezone
 * offset so "this month" lines up with the calendar the user sees, not UTC
 * day boundaries — the server does the actual `strftime` shift.
 *
 * Stale responses are dropped via `requestIdRef`: changing the date range
 * quickly (e.g. clicking through presets) must not let an older, slower
 * request overwrite a newer one.
 */
export function useUsageTimeseries(
  range: UsageTimeseriesRange,
  granularity: BucketGranularity = "day",
) {
  const [buckets, setBuckets] = useState<UsageBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      bucket: granularity,
      tzOffsetMinutes: String(new Date().getTimezoneOffset()),
    });

    try {
      const data = await apiClient.get<UsageBucket[]>(
        `/api/usage/timeseries?${params.toString()}`,
      );
      if (requestId === requestIdRef.current) {
        setBuckets(data);
        setError(null);
      }
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [range.from, range.to, granularity]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return { buckets, isLoading, error, reload: load };
}
