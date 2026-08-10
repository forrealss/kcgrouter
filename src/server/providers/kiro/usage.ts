/**
 * Kiro usage extraction helpers, shared by the streaming and non-streaming
 * paths.
 *
 * Verified against OmniRouter's Kiro executor (9router/open-sse/executors/
 * kiro.js): the only frames that carry *token counts* are `metricsEvent` and
 * `usageEvent` (camelCase `inputTokens`/`outputTokens`). `meteringEvent`
 * carries **credits** (`usage` + `unit`), not tokens — reading it as token
 * counts yields permanent 0. When no token data arrives at all (common: Kiro
 * omits the metering trailer on many turns), the usage is estimated the same
 * way OmniRouter does: input from `contextUsagePercentage` × context window,
 * output from emitted characters ÷ 4.
 */

export interface KiroTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface KiroMetering {
  credits: number;
  unit: string;
}

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Reads real token counts from a usage-carrying frame (`metricsEvent` /
 * `usageEvent`), tolerating nested payloads and snake_case variants. Returns
 * null when the frame carries no token data, so callers can distinguish
 * "no data" from "zero tokens".
 */
export function parseKiroTokenUsage(
  eventType: string,
  payload: Record<string, unknown> | null | undefined,
): KiroTokenUsage | null {
  if (!payload) return null;

  let raw: Record<string, unknown>;
  if (eventType === "metricsEvent") {
    raw = (payload.metricsEvent as Record<string, unknown>) ?? payload;
  } else if (eventType === "usageEvent") {
    raw = (payload.usageEvent as Record<string, unknown>) ?? payload;
  } else {
    return null;
  }

  const inputTokens =
    toNumber(raw.inputTokens) ??
    toNumber(raw.input_token_count) ??
    toNumber(raw.prompt_tokens) ??
    0;
  const outputTokens =
    toNumber(raw.outputTokens) ??
    toNumber(raw.output_token_count) ??
    toNumber(raw.completion_tokens) ??
    0;

  if (inputTokens === 0 && outputTokens === 0) return null;
  return { inputTokens, outputTokens };
}

/**
 * Reads credit metering from a `meteringEvent` frame. Kiro meters turns in
 * credits (`usage` + `unit`), not tokens — callers should log this for
 * diagnostics and never treat it as a token count.
 */
export function parseKiroMetering(
  payload: Record<string, unknown> | null | undefined,
): KiroMetering | null {
  if (!payload) return null;
  const metering =
    (payload.meteringEvent as Record<string, unknown>) ?? payload;
  const credits = toNumber(metering.usage);
  if (credits === undefined) return null;
  return {
    credits,
    unit: typeof metering.unit === "string" ? metering.unit : "credit",
  };
}

/**
 * Estimates input/output tokens when Kiro sent no token data. Mirrors
 * OmniRouter's fallback: input from `contextUsagePercentage` against the model
 * context window, output from emitted characters (≈4 chars/token).
 */
export function estimateKiroUsage(
  contextUsagePercentage: number,
  outputChars: number,
  contextWindow: number,
): KiroTokenUsage {
  const inputTokens =
    contextUsagePercentage > 0
      ? Math.floor((contextUsagePercentage * contextWindow) / 100)
      : 0;
  const outputTokens =
    outputChars > 0 ? Math.max(1, Math.floor(outputChars / 4)) : 0;
  return { inputTokens, outputTokens };
}
