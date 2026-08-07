export const id = 9;

export const sql = `
  ALTER TABLE api_keys ADD COLUMN key_enc TEXT;
`;
