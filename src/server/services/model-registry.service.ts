import { randomBytes } from "node:crypto";
import { get, query, run } from "../../db/client";
import type { ProviderModelRow } from "../../db/schema";
import { resolveQoderModels } from "../providers/qoder/model-catalog";

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

// --- Provider-specific model preview & import ---

/** A model fetched from an upstream catalog, before it is imported. */
export interface ModelCandidate {
  modelId: string;
  modelName: string;
  /** Whether this model is already registered for the provider. */
  exists: boolean;
  contextLength?: number;
  maxOutputTokens?: number;
}

/**
 * Pull the live Qoder model catalog (COSY-signed /algo/api/v2/model/list)
 * and return every usable model WITHOUT writing to the database. The caller
 * decides which candidates to import (see {@link importModels}).
 *
 * Throws with a user-facing message when the catalog cannot be fetched.
 */
export async function previewQoderModels(
  providerId: string,
  apiKey: string,
): Promise<ModelCandidate[]> {
  const catalog = await resolveQoderModels(apiKey, { forceRefresh: true });
  if (!catalog || catalog.models.length === 0) {
    throw new Error(
      "Failed to fetch Qoder models — check the connection and try again",
    );
  }

  return catalog.models.map((model) => ({
    modelId: model.id,
    modelName: model.name,
    contextLength: model.contextLength,
    maxOutputTokens:
      model.maxOutputTokens > 0 ? model.maxOutputTokens : undefined,
    exists: Boolean(getModelByProviderAndModelId(providerId, model.id)),
  }));
}

/** Normalize an OpenAI-compatible /models payload into { id, name } entries. */
function parseOpenAIModels(
  data: unknown,
): Array<{ id: string; name?: string }> {
  if (Array.isArray(data)) {
    return data.filter(
      (m): m is { id: string; name?: string } =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as { id?: unknown }).id === "string",
    );
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["data", "models", "results"]) {
      if (Array.isArray(obj[key])) {
        return parseOpenAIModels(obj[key]);
      }
    }
  }

  return [];
}

/**
 * Fetch the model list from an OpenAI-compatible endpoint
 * (`GET {baseUrl}/models`) and return every model WITHOUT writing to the
 * database. Existing entries are flagged via `exists`.
 *
 * Throws with a user-facing message on auth failure / non-2xx / empty list.
 */
export async function previewOpenAIModels(
  providerId: string,
  baseUrl: string,
  apiKey: string,
): Promise<ModelCandidate[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out fetching models from ${url}`);
    }
    throw new Error(
      `Failed to reach ${url}: ${err instanceof Error ? err.message : "network error"}`,
    );
  }
  clearTimeout(timeout);

  if (res.status === 401 || res.status === 403) {
    throw new Error("Invalid API key");
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch models (HTTP ${res.status})`);
  }

  const data: unknown = await res.json().catch(() => null);
  const list = parseOpenAIModels(data);
  if (list.length === 0) {
    throw new Error("Provider returned no models");
  }

  return list.map((m) => ({
    modelId: m.id,
    modelName: m.name || m.id,
    exists: Boolean(getModelByProviderAndModelId(providerId, m.id)),
  }));
}

/**
 * Insert only the selected models into the provider's registry. Existing
 * entries are skipped so re-imports never duplicate or clobber user data.
 */
export function importModels(
  providerId: string,
  selections: Array<{
    modelId: string;
    modelName?: string;
    contextLength?: number;
    maxOutputTokens?: number;
  }>,
): { added: number; skipped: number; models: ProviderModel[] } {
  let added = 0;
  let skipped = 0;

  for (const selection of selections) {
    const modelId = selection.modelId.trim();
    if (!modelId) {
      skipped += 1;
      continue;
    }
    if (getModelByProviderAndModelId(providerId, modelId)) {
      skipped += 1;
      continue;
    }
    addModel(
      providerId,
      modelId,
      selection.modelName?.trim() || modelId,
      selection.contextLength,
      selection.maxOutputTokens,
    );
    added += 1;
  }

  return { added, skipped, models: listModels(providerId) };
}
