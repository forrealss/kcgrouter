/**
 * Qoder credential resolution + model catalog fetcher, ported from 9router's
 * services/qoderModels.js and adapted to kcgrouter's flat `{ apiKey }`
 * credential model.
 *
 * A Qoder connection in kcgrouter stores a Personal Access Token (pt-...) as
 * its API key. PATs cannot sign COSY requests directly, so we exchange them
 * for short-lived job tokens (jt-...) via openapi.qoder.sh
 * /api/v1/jobToken/exchange (plain JSON POST), then resolve the userId via
 * the userinfo endpoint (needed for COSY signing).
 *
 * The live model catalog (/algo/api/v2/model/list, COSY-signed) provides the
 * exact per-model `model_config` block Qoder's chat endpoint requires —
 * sending the wrong block silently downgrades to a different model upstream.
 */

import { createHash } from "node:crypto";
import {
  QODER_CHAT_BASE_ALT,
  QODER_CLIENT_TYPE,
  QODER_IDE_VERSION,
  QODER_JOB_TOKEN_EXCHANGE_URL,
  QODER_MODEL_LIST_URL,
  QODER_MODEL_MAP,
  QODER_USERINFO_URL,
} from "./constants";
import { buildCosyHeaders } from "./cosy";

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h, same as the Kiro catalog

const PAT_PREFIX = "pt-";
const JOB_TOKEN_PREFIX = "jt-";

// PAT → job-token cache: a job token is short-lived (24h), so we keep it per
// PAT and re-exchange once it is within 5 minutes of expiry.
const PAT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PAT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResolvedQoderCredential {
  accessToken: string;
  userId: string;
  machineId: string;
}

export interface QoderModelConfig {
  key: string;
  is_reasoning?: boolean;
  max_output_tokens?: number;
  [field: string]: unknown;
}

interface CatalogEntry {
  expiresAt: number;
  models: Array<{
    id: string;
    name: string;
    contextLength: number;
    isVL: boolean;
    isReasoning: boolean;
    maxOutputTokens: number;
    description: string;
  }>;
  rawConfigs: Map<string, QoderModelConfig>;
  fetched: boolean;
}

interface PatEntry {
  jobToken: string;
  userId: string;
  machineId: string;
  expiresAt: number;
}

interface JtEntry {
  userId: string;
  machineId: string;
  expiresAt: number;
}

export function isQoderPat(token: string): boolean {
  return typeof token === "string" && token.startsWith(PAT_PREFIX);
}

export function isQoderJobToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(JOB_TOKEN_PREFIX);
}

/** @type {Map<string, PatEntry>} */
const patJobCache = new Map<string, PatEntry>();
/** @type {Map<string, JtEntry>} */
const jtCache = new Map<string, JtEntry>();

/** @type {Map<string, CatalogEntry>} */
const catalogCache = new Map<string, CatalogEntry>();

/**
 * In-flight fetch promises keyed by cacheKey. Concurrent first-time callers
 * (parallel chat windows) all observe the same Promise so we fan-out exactly
 * one upstream request per credential per miss.
 */
const inflight = new Map<string, Promise<CatalogEntry | null>>();

function stableCacheKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchange a Qoder PAT (pt-...) for a short-lived job token (jt-...).
 * This endpoint is plain JSON POST — NOT COSY-signed.
 */
async function exchangeJobToken(pat: string): Promise<{
  jobToken: string;
  expiresAt: number;
}> {
  const res = await fetchWithTimeout(
    QODER_JOB_TOKEN_EXCHANGE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "qodercli/1.0.0",
        "Cosy-Version": QODER_IDE_VERSION,
        "Cosy-ClientType": QODER_CLIENT_TYPE,
      },
      body: JSON.stringify({ personal_token: pat }),
    },
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `qoder PAT exchange failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    expires_at?: string | number;
    expires_in?: number;
  };
  if (!data.token) throw new Error("qoder PAT exchange returned no job token");

  let expiresAt = Date.now() + PAT_DEFAULT_TTL_MS;
  if (data.expires_at != null) {
    const parsed = Date.parse(String(data.expires_at));
    if (!Number.isNaN(parsed)) expiresAt = parsed;
  } else if (typeof data.expires_in === "number" && data.expires_in > 0) {
    // expires_in is seconds, not ms.
    expiresAt = Date.now() + data.expires_in * 1000;
  }
  return { jobToken: data.token, expiresAt };
}

/**
 * Resolve the Qoder userId for a job token (needed for COSY signing).
 * Returns "" on any failure — callers fall back to the stored userId.
 */
async function fetchUserIdForJobToken(jobToken: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      QODER_USERINFO_URL,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jobToken}`,
          Accept: "application/json",
          "User-Agent": "qodercli/1.0.0",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return "";
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      userId?: string;
      user_id?: string;
    };
    return data.id || data.userId || data.user_id || "";
  } catch {
    return "";
  }
}

/**
 * Resolve a raw API key to COSY-signable credentials.
 *
 *   - pt-... (PAT): exchanged for a short-lived job token; userId + machineId
 *     cached alongside so every request from the same key reuses them.
 *   - jt-... (job token): used directly; userId resolved via userinfo.
 *   - anything else: rejected with a clear message — kcgrouter has no Qoder
 *     OAuth flow, so only PATs are supported as connection keys.
 */
export async function resolveQoderCredentials(
  apiKey: string,
): Promise<ResolvedQoderCredential> {
  const raw = String(apiKey || "");

  if (isQoderPat(raw)) {
    const cached = patJobCache.get(raw);
    if (cached && cached.expiresAt - Date.now() > PAT_REFRESH_BUFFER_MS) {
      return {
        accessToken: cached.jobToken,
        userId: cached.userId,
        machineId: cached.machineId,
      };
    }
    const { jobToken, expiresAt } = await exchangeJobToken(raw);
    const userId = await fetchUserIdForJobToken(jobToken);
    const entry: PatEntry = {
      jobToken,
      userId,
      machineId: cached?.machineId || crypto.randomUUID(),
      expiresAt,
    };
    patJobCache.set(raw, entry);
    return { accessToken: jobToken, userId, machineId: entry.machineId };
  }

  if (isQoderJobToken(raw)) {
    const cached = jtCache.get(raw);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        accessToken: raw,
        userId: cached.userId,
        machineId: cached.machineId,
      };
    }
    const userId = await fetchUserIdForJobToken(raw);
    const entry: JtEntry = {
      userId,
      machineId: cached?.machineId || crypto.randomUUID(),
      expiresAt: Date.now() + PAT_DEFAULT_TTL_MS,
    };
    jtCache.set(raw, entry);
    return { accessToken: raw, userId, machineId: entry.machineId };
  }

  throw new Error(
    "qoder: expected a Personal Access Token (pt-...) as the API key. " +
      "Generate one at https://qoder.com/account/integrations",
  );
}

/**
 * Minimal static model_config used as a last-resort fallback when the live
 * catalog cannot be fetched (e.g. upstream temporarily unreachable). Only
 * covers the canonical keys in QODER_MODEL_MAP.
 */
export function staticModelConfig(modelKey: string): QoderModelConfig | null {
  if (!QODER_MODEL_MAP[modelKey]) return null;
  return { key: modelKey, is_reasoning: false, max_output_tokens: 32_768 };
}

/**
 * Fetch the live model list for a credential. Returns
 *   { models: [...], rawConfigs: Map<modelKey, modelConfigObject> }
 * or `null` on any error.
 */
async function fetchQoderCatalogRaw(
  credential: ResolvedQoderCredential,
): Promise<Pick<CatalogEntry, "models" | "rawConfigs"> | null> {
  if (!credential.userId || !credential.accessToken) return null;

  // Job-token traffic is rejected by api3 ("Login expired" 403) — the
  // official qodercli serves it from api2 instead.
  const modelListUrl = isQoderJobToken(credential.accessToken)
    ? `${QODER_CHAT_BASE_ALT}/algo/api/v2/model/list`
    : QODER_MODEL_LIST_URL;

  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "identity",
    ...buildCosyHeaders(Buffer.alloc(0), modelListUrl, {
      userId: credential.userId,
      authToken: credential.accessToken,
      machineId: credential.machineId,
    }),
  };

  const response = await fetchWithTimeout(
    modelListUrl,
    { method: "GET", headers },
    FETCH_TIMEOUT_MS,
  );
  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    chat?: unknown[];
  } | null;
  if (!body || !Array.isArray(body.chat)) return null;

  const models: CatalogEntry["models"] = [];
  const rawConfigs = new Map<string, QoderModelConfig>();
  for (const entry of body.chat) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key : "";
    if (!key) continue;

    // Always cache the config — chat needs model_config even for UI-hidden
    // models (enable:false). Upstream still accepts chat for these keys.
    rawConfigs.set(key, rec as QoderModelConfig);
    if (rec.enable === false) continue;

    const display =
      typeof rec.display_name === "string" ? rec.display_name : key;
    const ctx = Number(rec.max_input_tokens) || 131_072;
    models.push({
      id: key,
      name: display,
      contextLength: ctx,
      isVL: !!rec.is_vl,
      isReasoning: !!rec.is_reasoning,
      maxOutputTokens: Number(rec.max_output_tokens) || 0,
      description: typeof rec.description === "string" ? rec.description : "",
    });
  }

  return { models, rawConfigs };
}

/**
 * Resolve the live model catalog + raw configs for a credential. Caches
 * results for CACHE_TTL_MS so repeated chat requests don't re-fetch, and
 * deduplicates concurrent misses so parallel chat windows fan-out exactly
 * one upstream request per credential.
 */
export async function resolveQoderModels(
  apiKey: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CatalogEntry | null> {
  let credential: ResolvedQoderCredential;
  try {
    credential = await resolveQoderCredentials(apiKey);
  } catch {
    return null;
  }
  if (!credential.accessToken || !credential.userId) return null;

  // Key on the stable userId (falls back to the accessToken when the userId
  // could not be resolved) so the 1h catalog cache survives job-token
  // rotation instead of re-fetching after every 24h re-exchange.
  const key = stableCacheKey(credential.userId || credential.accessToken);
  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(key);
    if (cached && cached.expiresAt > now) return cached;
  }

  // Coalesce concurrent misses on the same credential into one upstream call.
  const existing = inflight.get(key);
  if (existing && !options.forceRefresh) return existing;

  const fetchPromise = (async () => {
    const fetched = await fetchQoderCatalogRaw(credential);
    if (!fetched) return null;
    const entry: CatalogEntry = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      models: fetched.models,
      rawConfigs: fetched.rawConfigs,
      fetched: true,
    };
    catalogCache.set(key, entry);
    return entry;
  })();

  inflight.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    if (inflight.get(key) === fetchPromise) {
      inflight.delete(key);
    }
  }
}

/**
 * Get the cached model_config block for a given model key, fetching the
 * catalog first if needed. Returns null when the catalog can't be fetched
 * (so callers can fall back to the static config).
 */
export async function getQoderModelConfig(
  apiKey: string,
  modelKey: string,
): Promise<QoderModelConfig | null> {
  const catalog = await resolveQoderModels(apiKey);
  if (!catalog) return null;
  const config = catalog.rawConfigs.get(modelKey);
  if (!config) return null;
  // Defensive copy — chat code may mutate `key` to align with the alias path.
  return { ...config, key: modelKey };
}
