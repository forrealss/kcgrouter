export const id = 6;

export const sql = `
  -- Add request/response payload columns to usage_records
  ALTER TABLE usage_records ADD COLUMN request_body TEXT;
  ALTER TABLE usage_records ADD COLUMN response_body TEXT;
`;
