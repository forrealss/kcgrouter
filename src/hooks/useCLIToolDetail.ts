import { useCallback, useEffect, useMemo, useState } from "react";
import type { MultiComboboxOption } from "@/components/ui/multi-combobox";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type {
  ApiKeySummary,
  CLIToolApplyPayload,
  CLIToolDetails,
  CLIToolSummary,
} from "@/types/cli-tool";
import type { Provider, ProviderModel } from "@/types/provider";

export interface CLIToolMessage {
  type: "success" | "error";
  text: string;
}

export function useCLIToolDetail(toolId: string) {
  const defaultEndpoint = useMemo(() => `${window.location.origin}/v1`, []);

  const [status, setStatus] = useState<CLIToolDetails | null>(null);
  const [toolMeta, setToolMeta] = useState<CLIToolSummary | null>(null);
  const [modelOptions, setModelOptions] = useState<MultiComboboxOption[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<CLIToolMessage | null>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [toolStatus, toolsList, providersList, keysList] =
        await Promise.all([
          apiClient.get<CLIToolDetails>(
            `/api/cli-tools/${encodeURIComponent(toolId)}`,
          ),
          apiClient.get<Record<string, CLIToolSummary>>("/api/cli-tools"),
          apiClient.get<Provider[]>("/api/providers"),
          apiClient.get<ApiKeySummary[]>("/api/settings/api-keys"),
        ]);
      setStatus(toolStatus);
      setToolMeta(toolsList[toolId] ?? null);
      setApiKeys(keysList.filter((key) => key.has_key));

      const modelLists = await Promise.all(
        providersList.map((provider) =>
          apiClient
            .get<ProviderModel[]>(
              `/api/providers/${encodeURIComponent(provider.id)}/models`,
            )
            .catch(() => [] as ProviderModel[]),
        ),
      );

      const options: MultiComboboxOption[] = [];
      const seen = new Set<string>();
      providersList.forEach((provider, index) => {
        for (const model of modelLists[index] ?? []) {
          if (!model.enabled) continue;
          const value = `${provider.prefix}/${model.modelId}`;
          if (seen.has(value)) continue;
          seen.add(value);
          options.push({
            value,
            label: value,
            description: model.modelName,
          });
        }
      });
      setModelOptions(options);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [toolId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function applyConfig(payload: CLIToolApplyPayload) {
    setIsSaving(true);
    setMessage(null);
    try {
      await apiClient.post(
        `/api/cli-tools/${encodeURIComponent(toolId)}`,
        payload,
      );
      setMessage({ type: "success", text: "Config applied" });
      await loadAll();
    } catch (requestError) {
      setMessage({ type: "error", text: getApiErrorMessage(requestError) });
    } finally {
      setIsSaving(false);
    }
  }

  async function resetConfig() {
    setIsSaving(true);
    setMessage(null);
    try {
      await apiClient.delete(`/api/cli-tools/${encodeURIComponent(toolId)}`);
      setMessage({ type: "success", text: "Provider removed from config" });
      await loadAll();
    } catch (requestError) {
      setMessage({ type: "error", text: getApiErrorMessage(requestError) });
    } finally {
      setIsSaving(false);
    }
  }

  return {
    status,
    toolMeta,
    modelOptions,
    apiKeys,
    isLoading,
    error,
    isSaving,
    message,
    defaultEndpoint,
    applyConfig,
    resetConfig,
  };
}
