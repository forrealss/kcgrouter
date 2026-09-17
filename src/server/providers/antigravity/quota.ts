/**
 * Antigravity quota tracker — ported from 9router's usage layer:
 *   - open-sse/services/usage/google.js        (getAntigravityUsage)
 *   - open-sse/services/usage/antigravity-weekly.js (weekly summary)
 *
 * Two sources are combined:
 *
 *   1. `v1internal:fetchAvailableModels` — per-model quota (5h-style window).
 *      Only meaningful for paid tiers; on the free tier Google reports
 *      misleading fractions (missing remainingFraction defaults to 0, or
 *      reflects the weekly limit instead of a 5h window), so free-tier
 *      accounts skip per-model rows entirely.
 *
 *   2. `v1internal:retrieveUserQuotaSummary` — weekly buckets (Gemini weekly,
 *      Claude & GPT weekly). Works on every tier.
 *
 * Fractions are normalized to a 0–1000 base like 9router, so `used`/`total`
 * read as promille of the window consumed. Rows follow kcgrouter's
 * ProviderQuota shape (name/used/total/resetAt/kind), which the QuotaCard
 * renders as progress windows.
 *
 * Free-tier reconciliation (kept from 9router #3892): on Google's Free
 * Starter tier retrieveUserQuotaSummary buggily reports remainingFraction: 1
 * even after the starter quota is depleted and every model 429s. When every
 * model of a family is exhausted while the weekly row claims availability,
 * force the weekly row to exhausted with the models' max reset time.
 */

export const ANTIGRAVITY_QUOTA_BASE_URL =
  "https://daily-cloudcode-pa.googleapis.com";

export const FETCH_AVAILABLE_MODELS_URL = `${ANTIGRAVITY_QUOTA_BASE_URL}/v1internal:fetchAvailableModels`;
export const RETRIEVE_USER_QUOTA_SUMMARY_URL = `${ANTIGRAVITY_QUOTA_BASE_URL}/v1internal:retrieveUserQuotaSummary`;
export const LOAD_CODE_ASSIST_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";

export const ANTIGRAVITY_IDE_USER_AGENT = "antigravity/ide/2.11.0 darwin/arm64";

/** Normalize remaining fractions to this base (9router convention). */
const TOTAL_BASE = 1000;

/** Mirrors the IDE request the quota endpoints expect (9router CLIENT_METADATA). */
const CLIENT_METADATA = { ideType: 9, pluginType: 2, platform: 3 };

/** Models surfaced on the quota card — must match the seeded catalog ids. */
const IMPORTANT_MODELS = new Set([
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "gemini-3.7-flash-high",
  "gemini-3.7-flash-medium",
  "gemini-3.7-flash-low",
  "gemini-3.6-flash-high",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-low",
  "gemini-3.5-flash-high",
  "gemini-pro-agent",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
]);

export interface ModelQuota {
  /** Promille of the per-model window already consumed (0–1000). */
  used: number;
  /** Normalized base (1000). */
  total: number;
  resetAt: string | null;
  remainingPercentage: number;
}

export interface WeeklyQuota {
  used: number;
  total: number;
  resetAt: string | null;
  remainingPercentage: number;
  displayName: string;
}

export interface AntigravityQuotaResult {
  quotas: Record<string, ModelQuota | WeeklyQuota>;
  plan: string | null;
}

// --- reset-time parsing (9router parseResetTime) ---

/**
 * Accepts ISO strings, unix seconds, or unix milliseconds — Cloud Code
 * endpoints are inconsistent about which they return.
 */
export function parseResetTime(resetValue: unknown): string | null {
  if (resetValue == null) return null;

  try {
    if (typeof resetValue === "number") {
      return new Date(
        resetValue < 1e12 ? resetValue * 1000 : resetValue,
      ).toISOString();
    }
    if (typeof resetValue === "string") {
      if (/^\d+$/.test(resetValue)) {
        const ts = Number(resetValue);
        return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
      }
      const date = new Date(resetValue);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

// --- per-model quota (fetchAvailableModels) ---

interface FetchAvailableModelsPayload {
  models?: Record<
    string,
    {
      isInternal?: boolean;
      displayName?: string;
      quotaInfo?: {
        remainingFraction?: unknown;
        resetTime?: unknown;
      } | null;
    }
  >;
}

/**
 * Map a fetchAvailableModels payload into per-model quota rows. Pure — safe
 * to unit-test against captured payloads.
 */
export function parseModelQuotas(
  data: FetchAvailableModelsPayload | null | undefined,
): Record<string, ModelQuota> {
  const quotas: Record<string, ModelQuota> = {};
  if (!data || typeof data !== "object" || !data.models) return quotas;

  for (const [modelKey, info] of Object.entries(data.models)) {
    if (!info || info.isInternal) continue;
    if (!IMPORTANT_MODELS.has(modelKey)) continue;
    if (!info.quotaInfo) continue;

    const fraction = Number(info.quotaInfo.remainingFraction);
    if (!Number.isFinite(fraction)) continue;

    const clamped = Math.min(Math.max(fraction, 0), 1);
    const remaining = Math.round(TOTAL_BASE * clamped);

    quotas[modelKey] = {
      used: TOTAL_BASE - remaining,
      total: TOTAL_BASE,
      resetAt: parseResetTime(info.quotaInfo.resetTime),
      remainingPercentage: clamped * 100,
    };
  }

  return quotas;
}

// --- weekly quota (retrieveUserQuotaSummary) ---

interface QuotaSummaryPayload {
  groups?: unknown;
  quotaSummary?: { groups?: unknown };
}

interface WeeklyGroup {
  displayName?: string;
  buckets?: Array<{
    bucketId?: string;
    displayName?: string;
    disabled?: boolean;
    remainingFraction?: number;
    resetTime?: unknown;
  }>;
}

/** Group display-name → stable weekly row. First match wins. */
const GROUP_MATCHERS: Array<{
  pattern: RegExp;
  key: string;
  displayName: string;
}> = [
  { pattern: /gemini/i, key: "gemini_weekly", displayName: "Gemini (Weekly)" },
  {
    pattern: /claude|gpt/i,
    key: "claude_gpt_weekly",
    displayName: "Claude & GPT (Weekly)",
  },
];

/**
 * Map a retrieveUserQuotaSummary payload into normalized weekly rows. Pure —
 * safe to unit-test. Groups may live at data.groups or
 * data.quotaSummary.groups; weekly buckets are identified by "weekly" in the
 * bucketId/displayName text.
 */
export function parseWeeklyQuotaSummary(
  data: QuotaSummaryPayload | null | undefined,
): Record<string, WeeklyQuota> {
  const result: Record<string, WeeklyQuota> = {};
  if (!data || typeof data !== "object") return result;

  const groups: WeeklyGroup[] = Array.isArray(data.groups)
    ? (data.groups as WeeklyGroup[])
    : Array.isArray(data.quotaSummary?.groups)
      ? ((data.quotaSummary?.groups ?? []) as WeeklyGroup[])
      : [];

  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const displayName = group.displayName ?? "";

    for (const bucket of Array.isArray(group.buckets) ? group.buckets : []) {
      if (!bucket || typeof bucket !== "object") continue;

      const bucketText =
        `${bucket.bucketId ?? ""} ${bucket.displayName ?? ""}`.toLowerCase();
      if (!bucketText.includes("weekly")) continue;
      if (bucket.disabled === true) continue;

      const fraction = Number(bucket.remainingFraction);
      if (!Number.isFinite(fraction)) continue;

      for (const matcher of GROUP_MATCHERS) {
        if (!matcher.pattern.test(displayName)) continue;
        if (result[matcher.key]) break; // first matching bucket per family wins

        const clamped = Math.min(Math.max(fraction, 0), 1);
        const remaining = Math.round(TOTAL_BASE * clamped);
        result[matcher.key] = {
          used: Math.max(0, TOTAL_BASE - remaining),
          total: TOTAL_BASE,
          resetAt: parseResetTime(bucket.resetTime),
          remainingPercentage: clamped * 100,
          displayName: matcher.displayName,
        };
        break;
      }
    }
  }

  return result;
}

// --- free-tier reconciliation (9router #3892) ---

/**
 * Reconcile weekly rows against per-model state: if every model of a family
 * is exhausted until a future reset, the weekly limit cannot still be
 * available — Google's free tier reports remainingFraction: 1 even after the
 * quota is depleted. Pure — mutates and returns `weekly`.
 */
export function reconcileWeeklyAgainstModels(
  modelQuotas: Record<string, ModelQuota>,
  weekly: Record<string, WeeklyQuota>,
): Record<string, WeeklyQuota> {
  const entries = Object.entries(modelQuotas);
  const geminiModels = entries.filter(
    ([key]) => key.startsWith("gemini-") && !key.includes("image"),
  );
  const claudeModels = entries.filter(([key]) => key.startsWith("claude-"));

  const reconcileFamily = (
    family: Array<[string, ModelQuota]>,
    weeklyRow: WeeklyQuota,
  ) => {
    if (family.length === 0) return;
    const allExhausted = family.every(
      ([, quota]) => (quota.remainingPercentage ?? 0) === 0,
    );
    if (!allExhausted || weeklyRow.remainingPercentage <= 0) return;

    const maxResetAt = family.reduce<string | null>((max, [, quota]) => {
      if (!quota.resetAt) return max;
      if (!max || new Date(quota.resetAt) > new Date(max)) return quota.resetAt;
      return max;
    }, null);

    weeklyRow.used = weeklyRow.total;
    weeklyRow.remainingPercentage = 0;
    if (maxResetAt) weeklyRow.resetAt = maxResetAt;
  };

  if (weekly.gemini_weekly) {
    reconcileFamily(geminiModels, weekly.gemini_weekly);
  }
  if (weekly.claude_gpt_weekly) {
    reconcileFamily(claudeModels, weekly.claude_gpt_weekly);
  }

  return weekly;
}

// --- network layer ---

async function postJson(
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
        "X-Client-Name": "antigravity",
        "X-Client-Version": "2.11.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

interface SubscriptionInfo {
  currentTier?: { name?: string };
  paidTier?: { id?: string };
  cloudaicompanionProject?: string | { id?: string };
}

function extractProjectId(info: SubscriptionInfo | null): string | null {
  const project = info?.cloudaicompanionProject;
  if (typeof project === "string") return project.trim() || null;
  if (project && typeof project === "object" && typeof project.id === "string")
    return project.id.trim() || null;
  return null;
}

/**
 * Fetch live Antigravity quota for one access token. Best-effort: any
 * failure returns a result with a message and no quotas, never throws.
 */
export async function fetchAntigravityQuota(
  accessToken: string,
  projectId?: string,
): Promise<AntigravityQuotaResult> {
  const empty: AntigravityQuotaResult = { quotas: {}, plan: null };

  if (!accessToken) {
    return { ...empty, plan: null, quotas: {} };
  }

  try {
    // loadCodeAssist always runs (9router parity): it classifies the tier
    // (free-tier accounts must skip per-model rows) and yields the plan
    // label. A stored projectId from OAuth login still takes precedence for
    // the `project` field of the follow-up calls.
    const loaded = await postJson(LOAD_CODE_ASSIST_URL, accessToken, {
      metadata: CLIENT_METADATA,
      mode: 1,
    });
    const subscription =
      loaded.ok && loaded.data && typeof loaded.data === "object"
        ? (loaded.data as SubscriptionInfo)
        : null;
    projectId = projectId || extractProjectId(subscription) || undefined;

    const modelSettled = await postJson(
      FETCH_AVAILABLE_MODELS_URL,
      accessToken,
      projectId ? { project: projectId } : {},
    );

    if (modelSettled.status === 401 || modelSettled.status === 403) {
      return {
        ...empty,
        quotas: {},
        plan: null,
      };
    }

    const paidTierId = subscription?.paidTier?.id;
    const isFreeTier = !paidTierId || paidTierId === "free-tier";

    const modelQuotas =
      !isFreeTier && modelSettled.ok
        ? parseModelQuotas(modelSettled.data as FetchAvailableModelsPayload)
        : {};

    const weeklySettled = await postJson(
      RETRIEVE_USER_QUOTA_SUMMARY_URL,
      accessToken,
      projectId ? { project: projectId } : {},
    );

    const weekly =
      weeklySettled.ok && weeklySettled.data
        ? parseWeeklyQuotaSummary(weeklySettled.data as QuotaSummaryPayload)
        : {};

    reconcileWeeklyAgainstModels(modelQuotas, weekly);

    const quotas: Record<string, ModelQuota | WeeklyQuota> = {
      ...modelQuotas,
      ...weekly,
    };

    return {
      quotas,
      plan: subscription?.currentTier?.name ?? null,
    };
  } catch {
    return {
      quotas: {},
      plan: null,
    };
  }
}

// --- caching (ported from 9router antigravity-weekly.js) ---

/**
 * Successful results are cached for 3 minutes and concurrent callers share
 * one in-flight fetch, so the dashboard's two usage endpoints (list + per-
 * account) and repeated refreshes don't hammer Google's quota endpoints.
 * Empty results are never cached — an upstream hiccup or an expired token
 * must not pin stale emptiness for 3 minutes.
 */
export const QUOTA_CACHE_TTL_MS = 180_000;

interface QuotaCacheEntry {
  result?: AntigravityQuotaResult;
  expiresAt?: number;
  promise?: Promise<AntigravityQuotaResult>;
}

const quotaCache = new Map<string, QuotaCacheEntry>();

/** Exported for tests only. */
export function clearAntigravityQuotaCache(): void {
  quotaCache.clear();
}

/**
 * Cached/deduped wrapper around fetchAntigravityQuota. `cacheKey` should be
 * the stable account id (falls back to the token when absent). Pass
 * `refresh` to bypass the TTL window (dashboard's manual Refresh button);
 * the fresh result still replaces the cached entry.
 */
export async function getCachedAntigravityQuota(
  cacheKey: string,
  accessToken: string,
  projectId?: string,
  refresh = false,
): Promise<AntigravityQuotaResult> {
  const hit = quotaCache.get(cacheKey);
  if (hit?.promise) return hit.promise;
  if (refresh) quotaCache.delete(cacheKey);
  else if (hit?.result && (hit.expiresAt ?? 0) > Date.now()) return hit.result;

  const promise = fetchAntigravityQuota(accessToken, projectId);
  quotaCache.set(cacheKey, { promise });

  const result = await promise;
  if (Object.keys(result.quotas).length > 0) {
    quotaCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + QUOTA_CACHE_TTL_MS,
    });
  } else {
    quotaCache.delete(cacheKey);
  }
  return result;
}
