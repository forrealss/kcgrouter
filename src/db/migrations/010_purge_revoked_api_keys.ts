export const id = 10;

export const sql = `
  DELETE FROM api_keys WHERE revoked_at IS NOT NULL;
`;
