export const id = 4;

export const sql = `
  -- Add prefix column for provider/model routing
  ALTER TABLE providers ADD COLUMN prefix TEXT NOT NULL DEFAULT '';
`;
