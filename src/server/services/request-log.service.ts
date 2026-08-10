import type { SQLQueryBindings } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type {
  RequestLogRow,
  RequestLogSource,
  RequestLogType,
} from "../../db/schema";
import * as EventBus from "./event-bus";

export type { RequestLogSource, RequestLogType };

export interface RequestLogEntry {
  id: string;
  timestamp: string;
  type: RequestLogType;
  source: RequestLogSource;
  providerAccountId: string | null;
  comboId: string | null;
  model: string | null;
  sourceFormat: string | null;
  stream: boolean;
  message: string | null;
  latencyMs: number | null;
  requestId?: string | null;
}

export interface RequestLogRecord extends RequestLogEntry {
  accountLabel: string | null;
  providerId: string | null;
  providerName: string | null;
}

const PRUNE_KEEP = 2000;
const PRUNE_GRACE = 100;

interface LogRowWithJoins extends RequestLogRow {
  account_label: string | null;
  provider_id: string | null;
  provider_name: string | null;
}

function rowToRecord(row: LogRowWithJoins): RequestLogRecord {
  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    source: row.source,
    providerAccountId: row.provider_account_id,
    comboId: row.combo_id,
    model: row.model,
    sourceFormat: row.source_format,
    stream: row.stream === 1,
    message: row.message,
    latencyMs: row.latency_ms,
    requestId: row.request_id ?? null,
    accountLabel: row.account_label ?? null,
    providerId: row.provider_id ?? null,
    providerName: row.provider_name ?? null,
  };
}

/**
 * Prune old rows so the table stays bounded. Runs only once the table has
 * grown past the retention window by a grace margin, so the DELETE isn't
 * executed on every insert.
 */
function maybePrune(): void {
  const countRow = get<{ c: number }>("SELECT COUNT(*) AS c FROM request_logs");
  if (!countRow || countRow.c <= PRUNE_KEEP + PRUNE_GRACE) return;

  prune(PRUNE_KEEP);
}

export function record(entry: Omit<RequestLogEntry, "id" | "timestamp">): void {
  const id = `log_${randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();

  run(
    `INSERT INTO request_logs (id, timestamp, type, source, provider_account_id, combo_id, model, source_format, stream, message, latency_ms, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    now,
    entry.type,
    entry.source,
    entry.providerAccountId,
    entry.comboId,
    entry.model,
    entry.sourceFormat,
    entry.stream ? 1 : 0,
    entry.message,
    entry.latencyMs,
    entry.requestId ?? null,
  );

  EventBus.publish("log:new", {
    id,
    timestamp: now,
    type: entry.type,
    source: entry.source,
  });

  maybePrune();
}

export function getHistory(opts: {
  type?: RequestLogType;
  source?: RequestLogSource;
  providerAccountId?: string;
  providerId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): RequestLogRecord[] {
  const conditions: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (opts.type) {
    conditions.push("rl.type = ?");
    params.push(opts.type);
  }
  if (opts.source) {
    conditions.push("rl.source = ?");
    params.push(opts.source);
  }
  if (opts.providerAccountId) {
    conditions.push("rl.provider_account_id = ?");
    params.push(opts.providerAccountId);
  }
  if (opts.providerId) {
    conditions.push("p.id = ?");
    params.push(opts.providerId);
  }
  if (opts.from) {
    conditions.push("rl.timestamp >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push("rl.timestamp <= ?");
    params.push(opts.to);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 50;

  const rows = query<LogRowWithJoins>(
    `SELECT rl.*, pa.label AS account_label, p.id AS provider_id, p.name AS provider_name
     FROM request_logs rl
     LEFT JOIN provider_accounts pa ON pa.id = rl.provider_account_id
     LEFT JOIN providers p ON p.id = pa.provider_id
     ${where}
     ORDER BY rl.timestamp DESC LIMIT ?`,
    ...params,
    limit,
  );

  return rows.map(rowToRecord);
}

export interface RequestLogPayloads {
  requestBody: string | null;
  responseBody: string | null;
}

export function getPayloads(logId: string): RequestLogPayloads | null {
  const row = get<{
    usage_id: string | null;
    request_body: string | null;
    response_body: string | null;
  }>(
    `SELECT ur.id AS usage_id, ur.request_body, ur.response_body
     FROM request_logs rl
     LEFT JOIN usage_records ur ON ur.request_id = rl.request_id
     WHERE rl.id = ? AND rl.type IN ('request', 'success')
     ORDER BY ur.timestamp DESC
     LIMIT 1`,
    logId,
  );

  return row?.usage_id
    ? { requestBody: row.request_body, responseBody: row.response_body }
    : null;
}

export function clearAll(): void {
  run("DELETE FROM request_logs");
}

export function prune(keep: number): void {
  run(
    `DELETE FROM request_logs WHERE id NOT IN (
      SELECT id FROM request_logs ORDER BY timestamp DESC LIMIT ?
    )`,
    keep,
  );
}

export function count(): number {
  const row = get<{ c: number }>("SELECT COUNT(*) AS c FROM request_logs");
  return row?.c ?? 0;
}
