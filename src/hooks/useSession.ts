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
type SessionResponse = { ok: true; mustChangePassword?: boolean };

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeResponse["theme"] | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

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

    // The theme is public so the login page can apply the saved preference;
    // a failure here just falls back to the default (light) theme.
    try {
      const settings = await apiClient.get<ThemeResponse>(
        "/api/settings/theme",
      );
      setTheme(settings.theme);
    } catch {
      // ignore — keep the default theme
    }

    try {
      const session = await apiClient.get<SessionResponse>("/api/auth/session");
      setMustChangePassword(session.mustChangePassword === true);
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
    setMustChangePassword(false);
    setStatus("unauthenticated");
  }, []);

  return {
    status,
    error,
    theme,
    mustChangePassword,
    login,
    logout,
    refresh,
  };
}
