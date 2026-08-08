import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { MultiComboboxOption } from "@/components/ui/multi-combobox";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { transportMeta } from "@/lib/provider-meta";
import type {
  ApiKeySummary,
  CLIToolApplyPayload,
  CLIToolDetails,
  CLIToolSummary,
} from "@/types/cli-tool";
import type { Provider, ProviderModel } from "@/types/provider";

export interface ModelGroupMeta {
  icon?: string;
}

export function useCLIToolDetail(toolId: string) {
  const defaultEndpoint = useMemo(() => `${window.location.origin}/v1`, []);

  const [status, setStatus] = useState<CLIToolDetails | null>(null);
  const [toolMeta, setToolMeta] = useState<CLIToolSummary | null>(null);
  const [modelOptions, setModelOptions] = useState<MultiComboboxOption[]>([]);
  const [modelGroupMeta, setModelGroupMeta] = useState<
    Record<string, ModelGroupMeta>
  >({});
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      const groupMeta: Record<string, ModelGroupMeta> = {};
      const seen = new Set<string>();
      providersList.forEach((provider, index) => {
        groupMeta[provider.name] = {
          icon: transportMeta[provider.transport].icon,
        };
        for (const model of modelLists[index] ?? []) {
          if (!model.enabled) continue;
          const value = `${provider.prefix}/${model.modelId}`;
          if (seen.has(value)) continue;
          seen.add(value);
          options.push({
            value,
            label: value,
            description: model.modelName,
            group: provider.name,
          });
        }
      });
      setModelOptions(options);
      setModelGroupMeta(groupMeta);
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
    try {
      await apiClient.post(
        `/api/cli-tools/${encodeURIComponent(toolId)}`,
        payload,
      );
      toast.success("Config applied");
      await loadAll();
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetConfig() {
    setIsSaving(true);
    try {
      await apiClient.delete(`/api/cli-tools/${encodeURIComponent(toolId)}`);
      toast.success("Provider removed from config");
      await loadAll();
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return {
    status,
    toolMeta,
    modelOptions,
    modelGroupMeta,
    apiKeys,
    isLoading,
    error,
    isSaving,
    defaultEndpoint,
    applyConfig,
    resetConfig,
  };
}
