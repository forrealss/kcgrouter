import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface EncryptionHealthReport {
  mismatch: boolean;
  checked: number;
  undecryptable: number;
  accounts: {
    checked: number;
    undecryptable: number;
  };
  apiKeys: {
    checked: number;
    undecryptable: number;
  };
}

export function useEncryptionHealth() {
  const [health, setHealth] = useState<EncryptionHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<EncryptionHealthReport>(
        "/api/settings/encryption-health",
        { signal },
      );
      setHealth(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setHealth(null);
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { health, isLoading };
}
