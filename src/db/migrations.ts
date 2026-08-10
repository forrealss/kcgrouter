import { get, getDb } from "./client";
import * as m001 from "./migrations/001_create_initial_tables";
import * as m002 from "./migrations/002_create_token_saver_stats";
import * as m003 from "./migrations/003_recreate_providers";
import * as m004 from "./migrations/004_add_provider_prefix";
import * as m005 from "./migrations/005_create_provider_models";
import * as m006 from "./migrations/006_add_usage_payloads";
import * as m007 from "./migrations/007_add_mimo_provider";
import * as m008 from "./migrations/008_add_caveman_ponytail";
import * as m009 from "./migrations/009_add_api_key_enc";
import * as m010 from "./migrations/010_purge_revoked_api_keys";
import * as m011 from "./migrations/011_add_request_logs_and_last_error";
import * as m012 from "./migrations/012_remove_quota_reset";
import * as m013 from "./migrations/013_add_qoder_provider";
import * as m014 from "./migrations/014_link_request_logs_to_usage";
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
  m008,
  m009,
  m010,
  m011,
  m012,
  m013,
  m014,
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
      // Split into individual statements so ALTER TABLE failures (e.g. duplicate
      // column from a backfilled migration 001) don't block the rest.
      const statements = migration.sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        try {
          getDb().exec(stmt);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("duplicate column")) continue;
          throw err;
        }
      }
      getDb().run(
        "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
        [migration.id, new Date().toISOString()],
      );
      console.log(`Migration ${migration.id} applied`);
    }
  }

  for (const seeder of seeders) {
    seeder.seed();
  }
}
