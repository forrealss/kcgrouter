import { MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

type Theme = "light" | "dark";

type ThemeResponse = { theme: Theme };

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
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
    <Card>
      <CardHeader>
        <CardTitle>Tampilan</CardTitle>
        <CardDescription>
          Pilih tema dashboard yang nyaman untuk digunakan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Memuat preferensi tema...
          </div>
        ) : theme ? (
          <FieldGroup>
            <Field
              orientation="horizontal"
              data-disabled={isSaving || undefined}
            >
              <FieldContent>
                <FieldLabel htmlFor="theme-toggle">Tema gelap</FieldLabel>
                <FieldDescription>
                  {theme === "dark"
                    ? "Tema gelap sedang digunakan."
                    : "Tema terang sedang digunakan."}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="theme-toggle"
                checked={theme === "dark"}
                disabled={isSaving}
                onCheckedChange={(checked) =>
                  void updateTheme(checked ? "dark" : "light")
                }
              />
            </Field>
          </FieldGroup>
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
      </CardContent>
      <CardFooter className="justify-between border-t">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
          Tema disimpan pada perangkat ini
        </span>
        <Badge variant={theme === "dark" ? "secondary" : "outline"}>
          {isSaving ? <Spinner data-icon="inline-start" /> : null}
          {theme === "dark" ? "Dark" : "Light"}
        </Badge>
      </CardFooter>
    </Card>
  );
}

export { applyTheme, ThemeToggle };
export default ThemeToggle;
