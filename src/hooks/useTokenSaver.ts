import { useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { TokenSaverSettings } from "@/types/token-saver";

function isTokenSaverSettings(value: unknown): value is TokenSaverSettings {
  if (!value || typeof value !== "object") return false;

  const settings = value as Record<string, unknown>;

  return (
    typeof settings.enabled === "boolean" &&
    Array.isArray(settings.filters) &&
    settings.filters.every(
      (filter) =>
        !!filter &&
        typeof filter === "object" &&
        typeof (filter as Record<string, unknown>).name === "string" &&
        typeof (filter as Record<string, unknown>).active === "boolean",
    ) &&
    typeof settings.totalTokensSaved === "number" &&
    typeof settings.updatedAt === "string"
  );
}

export function useTokenSaver() {
  const [settings, setSettings] = useState<TokenSaverSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await apiClient.get<unknown>("/api/settings/token-saver", {
        signal,
      });

      if (!isTokenSaverSettings(data)) {
        throw new Error("Token saver settings returned an invalid response.");
      }

      setSettings(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(getApiErrorMessage(error));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings]);

  const persistEnabled = useCallback(
    async (enabled: boolean) => {
      if (!settings || isSaving) return;

      const previousSettings = settings;
      setSettings({ ...previousSettings, enabled });
      setIsSaving(true);
      setSaveError(null);

      try {
        const data = await apiClient.patch<unknown>(
          "/api/settings/token-saver-default",
          { enabled },
        );

        if (
          !data ||
          typeof data !== "object" ||
          (data as Record<string, unknown>).ok !== true
        ) {
          throw new Error("Token saver setting was not saved.");
        }
      } catch (error) {
        setSettings(previousSettings);
        setSaveError(getApiErrorMessage(error));
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, settings],
  );

  return {
    settings,
    isLoading,
    loadError,
    saveError,
    isSaving,
    loadSettings,
    persistEnabled,
  };
}
