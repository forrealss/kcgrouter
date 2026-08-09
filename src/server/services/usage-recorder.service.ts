import { randomBytes } from "node:crypto";
import { query, run } from "../../db/client";
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
  requestBody?: string | null;
  responseBody?: string | null;
  requestId?: string | null;
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

function rowToRecord(row: UsageRecordRow): UsageRecord {
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
    requestBody: row.request_body,
    responseBody: row.response_body,
    requestId: row.request_id ?? null,
  };
}

export function record(entry: Omit<UsageRecord, "id" | "timestamp">): void {
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
    entry.requestBody ?? null,
    entry.responseBody ?? null,
    entry.requestId ?? null,
  );
}

export function getHistory(opts: {
  providerAccountId?: string;
  model?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): UsageRecord[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

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

  const rows = query<UsageRecordRow>(
    `SELECT * FROM usage_records ${where} ORDER BY timestamp DESC LIMIT ?`,
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

  const rows = query<UsageRecordRow & { provider_account_id: string }>(
    `SELECT * FROM usage_records WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`,
    from,
    to,
  );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  const byProviderMap = new Map<
    string,
    {
      providerAccountId: string;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      requestCount: number;
    }
  >();

  for (const row of rows) {
    totalInputTokens += row.input_tokens;
    totalOutputTokens += row.output_tokens;
    totalCost += row.estimated_cost;

    const key = row.provider_account_id;
    const existing = byProviderMap.get(key);
    if (existing) {
      existing.inputTokens += row.input_tokens;
      existing.outputTokens += row.output_tokens;
      existing.cost += row.estimated_cost;
      existing.requestCount += 1;
    } else {
      byProviderMap.set(key, {
        providerAccountId: key,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cost: row.estimated_cost,
        requestCount: 1,
      });
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    byProvider: Array.from(byProviderMap.values()),
  };
}
