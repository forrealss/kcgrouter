import { get, getDb } from "./client";
import * as m001 from "./migrations/001_create_initial_tables";
import * as m002 from "./migrations/002_create_token_saver_stats";
import * as m003 from "./migrations/003_recreate_providers";
import * as m004 from "./migrations/004_add_provider_prefix";
import * as m005 from "./migrations/005_create_provider_models";
import * as m006 from "./migrations/006_add_usage_payloads";
import * as m007 from "./migrations/007_add_mimo_provider";
import * as s001 from "./seeders/001_seed_builtin_providers";
import * as s002 from "./seeders/002_seed_default_app_settings";
import * as s003 from "./seeders/003_seed_provider_models";
import * as s004 from "./seeders/004_seed_token_saver_stats";

interface MigrationRow {
  id: number;
  applied_at: string;
}

interface MigrationModule {
  id: number;
  sql: string;
}

interface SeederModule {
  seed: () => void;
}

const migrations: MigrationModule[] = [
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
].sort((a, b) => a.id - b.id);

const seeders: SeederModule[] = [s001, s002, s003, s004];

export { DEFAULT_PASSWORD } from "./seeders/002_seed_default_app_settings";

function ensureMigrationsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

export function runMigrations(): void {
  ensureMigrationsTable();

  for (const migration of migrations) {
    const applied = get<MigrationRow>(
      "SELECT id FROM _migrations WHERE id = ?",
      migration.id,
    );
    if (!applied) {
      getDb().exec(migration.sql);
      getDb().run(
        "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
        migration.id,
        new Date().toISOString(),
      );
      console.log(`Migration ${migration.id} applied`);
    }
  }

  for (const seeder of seeders) {
    seeder.seed();
  }
}
