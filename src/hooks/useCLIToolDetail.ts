import { Layers3Icon, type LucideIcon } from "lucide-react";
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
import type { Combo } from "@/types/combo";
import type { Provider, ProviderModel } from "@/types/provider";

export interface ModelGroupMeta {
  /** Image URL rendered next to the group header (e.g. provider logos). */
  icon?: string;
  /** Dark-mode image URL rendered next to the group header. */
  darkIcon?: string;
  /** Lucide icon rendered instead of `icon` when present (e.g. combos). */
  iconComponent?: LucideIcon;
}

/** Group key for combo targets so they stay separate from providers. */
const COMBO_GROUP = "Combos";

function comboDescription(combo: Combo): string {
  const strategy = combo.strategy === "fallback" ? "Fallback" : "Round-robin";
  const models =
    combo.memberCount === 1 ? "1 model" : `${combo.memberCount} models`;
  return `${strategy} · ${models}`;
}

export function useCLIToolDetail(toolId: string) {
  const [status, setStatus] = useState<CLIToolDetails | null>(null);
  // Root-style tools (Claude Code / Cowork) append /v1 themselves, so the
  // default endpoint points at the router root instead of /v1.
  const defaultEndpoint = useMemo(
    () =>
      `${window.location.origin}${
        status?.form?.baseUrlStyle === "root" ? "" : "/v1"
      }`,
    [status?.form?.baseUrlStyle],
  );
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
      const [toolStatus, toolsList, providersList, keysList, combosList] =
        await Promise.all([
          apiClient.get<CLIToolDetails>(
            `/api/cli-tools/${encodeURIComponent(toolId)}`,
          ),
          apiClient.get<Record<string, CLIToolSummary>>("/api/cli-tools"),
          apiClient.get<Provider[]>("/api/providers"),
          apiClient.get<ApiKeySummary[]>("/api/settings/api-keys"),
          apiClient.get<Combo[]>("/api/combos"),
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

      // Combos first: the selector is the combo name (the router resolves
      // unprefixed selectors by name, ids stay accepted for old configs).
      // Names containing "/" would be misparsed as a provider prefix, so
      // those combos are excluded.
      const usableCombos = combosList.filter(
        (combo) => combo.memberCount > 0 && !combo.name.includes("/"),
      );
      if (usableCombos.length > 0) {
        groupMeta[COMBO_GROUP] = { iconComponent: Layers3Icon };
        for (const combo of usableCombos) {
          if (seen.has(combo.name)) continue;
          seen.add(combo.name);
          options.push({
            value: combo.name,
            label: combo.name,
            description: comboDescription(combo),
            group: COMBO_GROUP,
          });
        }
      }

      providersList.forEach((provider, index) => {
        const meta = transportMeta[provider.transport];
        groupMeta[provider.name] = {
          icon: meta.icon,
          darkIcon: meta.darkIcon,
        };
        for (const model of modelLists[index] ?? []) {
          if (!model.enabled) continue;
          const value = `${provider.prefix}/${model.modelId}`;
          if (seen.has(value)) continue;
          seen.add(value);
          options.push({
            value,
            label: model.modelName,
            description: model.modelId,
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
    refreshDetails: loadAll,
  };
}
