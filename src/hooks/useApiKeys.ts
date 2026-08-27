import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

export interface ApiKeyEntry {
  id: string;
  label: string;
  has_key: boolean;
  created_at: string;
  last_used_at: string | null;
  /** Last 4 chars, so a key is identifiable without revealing it. */
  last4: string | null;
}

/**
 * List of API keys, extracted from `ApiKeyManager` so the dashboard summary
 * card can show a count + last-used time without duplicating its fetch
 * logic or pulling in the full CRUD component.
 */
export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<ApiKeyEntry[]>("/api/settings/api-keys");
      setKeys(data);
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

  return { keys, isLoading, error, reload: load };
}
