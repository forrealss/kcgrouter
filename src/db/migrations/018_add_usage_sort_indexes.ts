export const id = 18;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Indexes for the usage-history sorts (HISTORY_SORTS in
  -- usage-recorder.service.ts). The leading column must match the sort column
  -- and the trailing columns must match the tiebreakers, otherwise SQLite still
  -- builds a TEMP B-TREE for ORDER BY -- verified with EXPLAIN QUERY PLAN
  CREATE INDEX IF NOT EXISTS idx_usage_latency_ts
    ON usage_records(latency_ms, timestamp, id);

  CREATE INDEX IF NOT EXISTS idx_usage_cost_ts
    ON usage_records(estimated_cost, timestamp, id);

  -- The "most tokens" sort orders on a sum, so it needs an expression index
  CREATE INDEX IF NOT EXISTS idx_usage_tokens_ts
    ON usage_records((input_tokens + output_tokens), timestamp, id);

  -- Filtering by exact model is offered in the history filter popover
  CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
`;
