import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiClient,
  getApiErrorMessage,
} from "@/lib/api-client";
import { applyTheme, onSystemThemeChange, type Theme } from "@/lib/theme";

export type SessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

type LoginResponse = { ok: true };
type ThemeResponse = { theme: Theme };

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeResponse["theme"] | null>(null);

  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme === "system") {
      return onSystemThemeChange(() => applyTheme("system"));
    }
  }, [theme]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const settings = await apiClient.get<ThemeResponse>(
        "/api/settings/theme",
      );
      setTheme(settings.theme);
      setStatus("authenticated");
    } catch (requestError) {
      if (
        requestError instanceof ApiClientError &&
        requestError.status === 401
      ) {
        setStatus("unauthenticated");
        return;
      }

      setError(getApiErrorMessage(requestError));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (password: string) => {
      await apiClient.post<LoginResponse>("/api/auth/login", { password });
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await apiClient.post<LoginResponse>("/api/auth/logout");
    setError(null);
    setStatus("unauthenticated");
  }, []);

  return { status, error, theme, login, logout, refresh };
}
