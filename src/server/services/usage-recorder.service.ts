import type { SQLQueryBindings } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type { UsageRecordRow } from "../../db/schema";

export interface UsageRecord {
  id: string;
  timestamp: string;
  providerAccountId: string;
  comboId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "error";
  latencyMs: number;
  estimatedCost: number;
  hasPayload: boolean;
  requestId?: string | null;
}

/**
 * Payloads are capped at write time so a single huge request (multi-MB
 * streaming responses are common) cannot balloon the database or the detail
 * endpoint. Truncated bodies keep a marker so the UI can tell.
 */
const MAX_PAYLOAD_CHARS = 64 * 1024;

function truncatePayload(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= MAX_PAYLOAD_CHARS) return value;
  return `${value.slice(0, MAX_PAYLOAD_CHARS)}\n…[truncated, original ${value.length} chars]`;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byProvider: {
    providerAccountId: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    requestCount: number;
  }[];
}

/** Write-side shape: payloads in, before truncation and id/timestamp assignment. */
export interface UsageRecordEntry {
  providerAccountId: string;
  comboId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "error";
  latencyMs: number;
  estimatedCost: number;
  requestBody?: string | null;
  responseBody?: string | null;
  requestId?: string | null;
}

function rowToRecord(
  row: UsageRecordRow & { has_payload?: number },
): UsageRecord {
  return {
    id: row.id,
    timestamp: row.timestamp,
    providerAccountId: row.provider_account_id,
    comboId: row.combo_id,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    status: row.status,
    latencyMs: row.latency_ms,
    estimatedCost: row.estimated_cost,
    hasPayload: Boolean(row.has_payload),
    requestId: row.request_id ?? null,
  };
}

export function record(entry: UsageRecordEntry): void {
  const id = `ur_${randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();

  run(
    `INSERT INTO usage_records (id, timestamp, provider_account_id, combo_id, model, input_tokens, output_tokens, status, latency_ms, estimated_cost, request_body, response_body, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    now,
    entry.providerAccountId,
    entry.comboId ?? null,
    entry.model,
    entry.inputTokens,
    entry.outputTokens,
    entry.status,
    entry.latencyMs,
    entry.estimatedCost,
    truncatePayload(entry.requestBody),
    truncatePayload(entry.responseBody),
    entry.requestId ?? null,
  );
}

/**
 * Metadata columns only — never `request_body`/`response_body`. Those payloads
 * can average MBs per row, so selecting them turns every history page into a
 * multi-hundred-MB transfer; clients fetch them per record via getPayloads().
 */
const HISTORY_COLUMNS = `
  id, timestamp, provider_account_id, combo_id, model, input_tokens,
  output_tokens, status, latency_ms, estimated_cost,
  (request_body IS NOT NULL OR response_body IS NOT NULL) AS has_payload,
  request_id`;

export function getPayloads(
  id: string,
): { requestBody: string | null; responseBody: string | null } | null {
  const row = get<{
    request_body: string | null;
    response_body: string | null;
  }>("SELECT request_body, response_body FROM usage_records WHERE id = ?", id);
  if (!row) return null;
  return { requestBody: row.request_body, responseBody: row.response_body };
}

/**
 * Sort keys the history endpoint accepts, mapped to a fixed ORDER BY clause.
 *
 * SQL identifiers cannot be bound as parameters, so the clause must never be
 * built from caller input — this allowlist is the only source of column names.
 * Every entry ends with `timestamp DESC, id DESC` so rows that tie on the
 * primary key still come back in a stable order across pages.
 */
const HISTORY_SORTS = {
  newest: "timestamp DESC, id DESC",
  oldest: "timestamp ASC, id ASC",
  slowest: "latency_ms DESC, timestamp DESC, id DESC",
  fastest: "latency_ms ASC, timestamp DESC, id DESC",
  costliest: "estimated_cost DESC, timestamp DESC, id DESC",
  "most-tokens": "(input_tokens + output_tokens) DESC, timestamp DESC, id DESC",
} as const;

export type HistorySort = keyof typeof HISTORY_SORTS;

export const HISTORY_SORT_KEYS = Object.keys(HISTORY_SORTS) as HistorySort[];

export function isHistorySort(value: string): value is HistorySort {
  return Object.hasOwn(HISTORY_SORTS, value);
}

export function getHistory(opts: {
  providerAccountId?: string;
  model?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  sort?: HistorySort;
}): UsageRecord[] {
  const conditions: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (opts.providerAccountId) {
    conditions.push("provider_account_id = ?");
    params.push(opts.providerAccountId);
  }
  if (opts.model) {
    conditions.push("model = ?");
    params.push(opts.model);
  }
  if (opts.fromDate) {
    conditions.push("timestamp >= ?");
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    conditions.push("timestamp <= ?");
    params.push(opts.toDate);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 50;
  const orderBy = HISTORY_SORTS[opts.sort ?? "newest"];

  const rows = query<UsageRecordRow & { has_payload: number }>(
    `SELECT ${HISTORY_COLUMNS} FROM usage_records ${where} ORDER BY ${orderBy} LIMIT ?`,
    ...params,
    limit,
  );

  return rows.map(rowToRecord);
}

export function summarize(range?: { from: string; to: string }): UsageSummary {
  const now = new Date();
  const defaultFrom = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const from = range?.from ?? defaultFrom;
  const to = range?.to ?? now.toISOString();

  // Aggregate in SQL. Loading the rows into JS to sum them would drag every
  // stored payload column through memory; here only the per-provider totals
  // ever leave SQLite.
  const rows = query<{
    provider_account_id: string;
    input_tokens: number | null;
    output_tokens: number | null;
    estimated_cost: number | null;
    request_count: number;
  }>(
    `SELECT provider_account_id,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(estimated_cost) AS estimated_cost,
            COUNT(*) AS request_count
     FROM usage_records
     WHERE timestamp >= ? AND timestamp <= ?
     GROUP BY provider_account_id`,
    from,
    to,
  );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  const byProvider: UsageSummary["byProvider"] = [];

  for (const row of rows) {
    const inputTokens = row.input_tokens ?? 0;
    const outputTokens = row.output_tokens ?? 0;
    const cost = row.estimated_cost ?? 0;

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCost += cost;

    byProvider.push({
      providerAccountId: row.provider_account_id,
      inputTokens,
      outputTokens,
      cost,
      requestCount: row.request_count,
    });
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    byProvider,
  };
}
