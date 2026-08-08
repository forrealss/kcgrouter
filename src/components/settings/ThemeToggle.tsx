import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ThemePicker } from "@/components/ui/theme-picker";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { applyTheme, onSystemThemeChange, type Theme } from "@/lib/theme";

type ThemeResponse = { theme: Theme };

function themeDescription(theme: Theme): string {
  switch (theme) {
    case "dark":
      return "Tema gelap sedang digunakan.";
    case "system":
      return "Mengikuti preferensi tema perangkat.";
    default:
      return "Tema terang sedang digunakan.";
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTheme = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.get<ThemeResponse>("/api/settings/theme", {
        signal,
      });
      setTheme(data.theme);
      applyTheme(data.theme);
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === "AbortError"
      ) {
        return;
      }
      setError(getApiErrorMessage(loadError));
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadTheme(controller.signal);

    return () => controller.abort();
  }, [loadTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  }, [theme]);

  async function updateTheme(nextTheme: Theme) {
    if (!theme || isSaving || nextTheme === theme) return;

    const previousTheme = theme;
    setTheme(nextTheme);
    applyTheme(nextTheme);
    setError(null);
    setIsSaving(true);

    try {
      const result = await apiClient.patch<{ ok: true }>(
        "/api/settings/theme",
        {
          theme: nextTheme,
        },
      );
      if (result.ok !== true) {
        throw new Error("Tema tidak dapat disimpan.");
      }
    } catch (saveError) {
      setTheme(previousTheme);
      applyTheme(previousTheme);
      setError(getApiErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Memuat preferensi tema...
        </div>
      ) : theme ? (
        <Field orientation="horizontal" data-disabled={isSaving || undefined}>
          <FieldContent>
            <FieldLabel className="items-center gap-2">
              {theme === "dark" ? (
                <MoonIcon className="size-4 text-muted-foreground" />
              ) : theme === "system" ? (
                <MonitorIcon className="size-4 text-muted-foreground" />
              ) : (
                <SunIcon className="size-4 text-muted-foreground" />
              )}
              Tema
            </FieldLabel>
            <FieldDescription>
              {themeDescription(theme)} Preferensi disimpan pada perangkat ini.
            </FieldDescription>
          </FieldContent>
          <ThemePicker
            value={theme}
            onChange={(nextTheme) => void updateTheme(nextTheme)}
            disabled={isSaving}
          />
        </Field>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Preferensi tema tidak dapat diperbarui</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadTheme()}
              disabled={isSaving}
            >
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export { ThemeToggle };
export default ThemeToggle;
