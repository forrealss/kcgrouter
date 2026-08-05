import { get, run } from "../client";

export function seed(): void {
  const existing = get("SELECT id FROM token_saver_stats WHERE id = 1");
  if (existing) return;

  run(
    `INSERT OR IGNORE INTO token_saver_stats (id, total_tokens_saved, updated_at)
     VALUES (1, 0, datetime('now'))`,
  );
}
