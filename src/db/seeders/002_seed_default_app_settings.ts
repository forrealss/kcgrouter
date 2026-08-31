import { DEFAULT_PASSWORD } from "../../lib/password-strength";
import { get, getDb } from "../client";

export { DEFAULT_PASSWORD };

export function seed(): void {
  const existing = get<{ id: number }>(
    "SELECT id FROM app_settings WHERE id = 1",
  );
  if (existing) return;

  const passwordHash = Bun.password.hashSync(DEFAULT_PASSWORD);
  const now = new Date().toISOString();
  getDb().run(
    "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, 'light', 1, 0, 'full', 0, 'full', ?, ?)",
    [passwordHash, now, now],
  );
  console.log(
    `Seeded default app_settings with default password "${DEFAULT_PASSWORD}"`,
  );
}
