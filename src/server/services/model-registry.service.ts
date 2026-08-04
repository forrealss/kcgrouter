import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type { ProviderModelRow } from "../../db/schema";

export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  contextLength: number | null;
  maxOutputTokens: number | null;
  enabled: boolean;
  createdAt: string;
}

function generateId(): string {
  return `pm_${randomBytes(12).toString("hex")}`;
}

function rowToModel(row: ProviderModelRow): ProviderModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    modelName: row.model_name,
    contextLength: row.context_length,
    maxOutputTokens: row.max_output_tokens,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

export function listModels(providerId: string): ProviderModel[] {
  const rows = query<ProviderModelRow>(
    "SELECT * FROM provider_models WHERE provider_id = ? ORDER BY model_name ASC",
    providerId,
  );
  return rows.map(rowToModel);
}

export function listEnabledModels(providerId: string): ProviderModel[] {
  const rows = query<ProviderModelRow>(
    "SELECT * FROM provider_models WHERE provider_id = ? AND enabled = 1 ORDER BY model_name ASC",
    providerId,
  );
  return rows.map(rowToModel);
}

export function listAllEnabledModels(): Array<
  ProviderModel & { prefix: string }
> {
  const rows = query<ProviderModelRow & { prefix: string }>(
    `SELECT pm.*, p.prefix
     FROM provider_models pm
     JOIN providers p ON p.id = pm.provider_id
     WHERE pm.enabled = 1
     ORDER BY p.prefix, pm.model_name ASC`,
  );
  return rows.map((r) => ({
    ...rowToModel(r),
    prefix: r.prefix,
  }));
}

export function getModel(id: string): ProviderModel | null {
  const row = get<ProviderModelRow>(
    "SELECT * FROM provider_models WHERE id = ?",
    id,
  );
  if (!row) return null;
  return rowToModel(row);
}

export function getModelByProviderAndModelId(
  providerId: string,
  modelId: string,
): ProviderModel | null {
  const row = get<ProviderModelRow>(
    "SELECT * FROM provider_models WHERE provider_id = ? AND model_id = ?",
    providerId,
    modelId,
  );
  if (!row) return null;
  return rowToModel(row);
}

export function addModel(
  providerId: string,
  modelId: string,
  modelName: string,
  contextLength?: number,
  maxOutputTokens?: number,
): ProviderModel {
  const existing = get<ProviderModelRow>(
    "SELECT id FROM provider_models WHERE provider_id = ? AND model_id = ?",
    providerId,
    modelId,
  );
  if (existing) {
    throw new Error(`Model "${modelId}" already exists for this provider`);
  }

  const id = generateId();
  const now = new Date().toISOString();

  run(
    `INSERT INTO provider_models (id, provider_id, model_id, model_name, context_length, max_output_tokens, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    id,
    providerId,
    modelId,
    modelName,
    contextLength ?? null,
    maxOutputTokens ?? null,
    now,
  );

  return {
    id,
    providerId,
    modelId,
    modelName,
    contextLength: contextLength ?? null,
    maxOutputTokens: maxOutputTokens ?? null,
    enabled: false,
    createdAt: now,
  };
}

export function enableModel(id: string): void {
  run("UPDATE provider_models SET enabled = 1 WHERE id = ?", id);
}

export function disableModel(id: string): void {
  run("UPDATE provider_models SET enabled = 0 WHERE id = ?", id);
}

export function toggleModel(id: string): boolean {
  const model = getModel(id);
  if (!model) throw new Error("Model not found");
  const newEnabled = !model.enabled;
  run(
    "UPDATE provider_models SET enabled = ? WHERE id = ?",
    newEnabled ? 1 : 0,
    id,
  );
  return newEnabled;
}

export function deleteModel(id: string): void {
  const existing = get<ProviderModelRow>(
    "SELECT id FROM provider_models WHERE id = ?",
    id,
  );
  if (!existing) throw new Error("Model not found");
  run("DELETE FROM provider_models WHERE id = ?", id);
}
