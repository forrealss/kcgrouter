import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

type VersionResponse = {
  current: string;
  /** `null` when the registry could not be reached. */
  latest: string | null;
  updateAvailable: boolean;
  checkFailed: boolean;
  packageManager: string;
  updateCommand: string;
};

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export function useUpdateCheck() {
  const [data, setData] = useState<VersionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestFailed, setRequestFailed] = useState(false);

  const check = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<VersionResponse>("/api/settings/version");
      setData(res);
      setRequestFailed(false);
    } catch {
      setRequestFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [check]);

  return {
    current: data?.current ?? null,
    latest: data?.latest ?? null,
    updateAvailable: data?.updateAvailable ?? false,
    /**
     * True when the last check could not determine the published version —
     * either the registry lookup failed server-side or this request did.
     */
    checkFailed: requestFailed || (data?.checkFailed ?? false),
    updateCommand: data?.updateCommand ?? "",
    isLoading,
    refresh: check,
  };
}
