/**
 * Loads the pickable targets for an API key's scope: providers, their enabled
 * models, and combos.
 *
 * Mirrors the shape useCLIToolDetail builds, because the model values must be
 * the same `prefix/modelId` strings the router accepts as a selector.
 */
import type { Layers3Icon } from "lucide-react";
import { useEffect, useState } from "react";
import type { MultiComboboxOption } from "@/components/ui/multi-combobox";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { transportMeta } from "@/lib/provider-meta";
import type { Combo } from "@/types/combo";
import type { Provider, ProviderModel } from "@/types/provider";

/** A row from `GET /api/providers/models/all`. */
type EnabledModel = ProviderModel & {
  prefix: string;
  providerName: string;
};

export interface ScopeTargetGroupMeta {
  icon?: string;
  darkIcon?: string;
  iconComponent?: typeof Layers3Icon;
}

export interface ScopeTargets {
  providerOptions: MultiComboboxOption[];
  modelOptions: MultiComboboxOption[];
  comboOptions: MultiComboboxOption[];
  /** Per-group render metadata for the model picker, keyed by provider name. */
  modelGroupMeta: Record<string, ScopeTargetGroupMeta>;
  isLoading: boolean;
  error: string | null;
}

export function useApiKeyScopeTargets(enabled: boolean): ScopeTargets {
  const [providerOptions, setProviderOptions] = useState<MultiComboboxOption[]>(
    [],
  );
  const [modelOptions, setModelOptions] = useState<MultiComboboxOption[]>([]);
  const [comboOptions, setComboOptions] = useState<MultiComboboxOption[]>([]);
  const [modelGroupMeta, setModelGroupMeta] = useState<
    Record<string, ScopeTargetGroupMeta>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch once the dialog that needs these options is actually opened.
    if (!enabled) return;

    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [providers, combos] = await Promise.all([
          apiClient.get<Provider[]>("/api/providers", {
            signal: controller.signal,
          }),
          apiClient.get<Combo[]>("/api/combos", {
            signal: controller.signal,
          }),
        ]);

        setProviderOptions(
          providers.map((provider) => ({
            value: provider.id,
            label: provider.name,
            description: `${provider.prefix} · ${provider.accountCount} account${
              provider.accountCount === 1 ? "" : "s"
            }`,
            group: "Providers",
          })),
        );

        setComboOptions(
          combos.map((combo) => ({
            value: combo.id,
            label: combo.name,
            description: `${combo.strategy === "fallback" ? "Fallback" : "Round robin"} · ${combo.memberCount} member${
              combo.memberCount === 1 ? "" : "s"
            }`,
            group: "Combos",
          })),
        );

        // One aggregate request rather than one per provider. Fetching models
        // per provider meant 50 providers cost 50 parallel requests every time
        // the dialog opened, which stalled the picker for tens of seconds.
        const allModels = await apiClient.get<EnabledModel[]>(
          "/api/providers/models/all",
          { signal: controller.signal },
        );

        const transportByProviderId = new Map(
          providers.map((provider) => [provider.id, provider.transport]),
        );

        const options: MultiComboboxOption[] = [];
        const groupMeta: Record<string, ScopeTargetGroupMeta> = {};
        const seen = new Set<string>();

        for (const model of allModels) {
          // The prefixed form is what the router parses and what
          // GET /v1/models advertises, so store that as the allowlist entry.
          const value = `${model.prefix}/${model.modelId}`;
          if (seen.has(value)) continue;
          seen.add(value);

          if (!groupMeta[model.providerName]) {
            const transport = transportByProviderId.get(model.providerId);
            const meta = transport ? transportMeta[transport] : undefined;
            groupMeta[model.providerName] = {
              icon: meta?.icon,
              darkIcon: meta?.darkIcon,
            };
          }

          options.push({
            value,
            label: model.modelName,
            description: model.modelId,
            group: model.providerName,
          });
        }

        setModelOptions(options);
        setModelGroupMeta(groupMeta);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setError(getApiErrorMessage(requestError));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [enabled]);

  return {
    providerOptions,
    modelOptions,
    comboOptions,
    modelGroupMeta,
    isLoading,
    error,
  };
}
