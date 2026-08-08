export const id = 12;

export const sql = `
  -- Quota resets are handled by the upstream providers themselves (e.g. Kiro's
  -- 5-hour window, Command Code's weekly window). The router only tracks
  -- cumulative usage and an optional hard token cap.
  ALTER TABLE provider_accounts DROP COLUMN quota_reset_type;
  ALTER TABLE quota_state DROP COLUMN window_type;
  ALTER TABLE quota_state DROP COLUMN window_start;
  ALTER TABLE quota_state DROP COLUMN window_end;
`;
