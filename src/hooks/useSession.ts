import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiClient,
  getApiErrorMessage,
} from "@/lib/api-client";

export type SessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

type LoginResponse = { ok: true };
type ThemeResponse = { theme: "light" | "dark" };

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      await apiClient.get<ThemeResponse>("/api/settings/theme");
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

  const login = useCallback(async (password: string) => {
    await apiClient.post<LoginResponse>("/api/auth/login", { password });
    setError(null);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post<LoginResponse>("/api/auth/logout");
    setError(null);
    setStatus("unauthenticated");
  }, []);

  return { status, error, login, logout, refresh };
}
