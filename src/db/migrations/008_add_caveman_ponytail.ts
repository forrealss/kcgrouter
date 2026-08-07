export const id = 8;

export const sql = `
  ALTER TABLE app_settings ADD COLUMN caveman_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE app_settings ADD COLUMN caveman_level TEXT NOT NULL DEFAULT 'full';
  ALTER TABLE app_settings ADD COLUMN ponytail_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE app_settings ADD COLUMN ponytail_level TEXT NOT NULL DEFAULT 'full';
`;
