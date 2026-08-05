import { get, getDb } from "../client";

export const DEFAULT_PASSWORD = "admin";

export function seed(): void {
  const existing = get<{ id: number }>(
    "SELECT id FROM app_settings WHERE id = 1",
  );
  if (existing) return;

  const passwordHash = Bun.password.hashSync(DEFAULT_PASSWORD);
  const now = new Date().toISOString();
  getDb().run(
    "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, created_at, updated_at) VALUES (1, ?, 'light', 1, ?, ?)",
    passwordHash,
    now,
    now,
  );
  console.log(
    `Seeded default app_settings with default password "${DEFAULT_PASSWORD}"`,
  );
}
