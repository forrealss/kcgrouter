import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

type VersionResponse = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  packageManager: string;
  updateCommand: string;
};

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export function useUpdateCheck() {
  const [data, setData] = useState<VersionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const check = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<VersionResponse>("/api/settings/version");
      setData(res);
    } catch {
      // ignore — will retry on next interval
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
    updateCommand: data?.updateCommand ?? "",
    isLoading,
    refresh: check,
  };
}
