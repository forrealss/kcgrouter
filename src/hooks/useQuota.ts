import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { QuotaAccount } from "@/types/quota";

export function useQuota() {
  const [accounts, setAccounts] = useState<QuotaAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);

  const loadQuota = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<QuotaAccount[]>("/api/quota");
      if (requestId === requestIdRef.current) setAccounts(response);
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuota();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadQuota]);

  return { accounts, error, isLoading, loadQuota };
}
