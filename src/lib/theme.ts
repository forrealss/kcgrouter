export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && isSystemDark());
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", resolveDark(theme));
}

/**
 * Subscribe to OS color-scheme changes. Returns an unsubscribe function.
 * Callers should only act while the stored theme is "system".
 */
export function onSystemThemeChange(callback: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
