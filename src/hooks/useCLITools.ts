import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { CLIToolSummary } from "@/types/cli-tool";

export function useCLITools() {
  const [tools, setTools] = useState<Record<string, CLIToolSummary> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextTools =
        await apiClient.get<Record<string, CLIToolSummary>>("/api/cli-tools");
      setTools(nextTools);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTools();
  }, [refreshTools]);

  return { tools, isLoading, error, refreshTools };
}
