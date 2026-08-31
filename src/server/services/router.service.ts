import { randomUUID } from "node:crypto";
import { getAdapter } from "../providers/registry";
import { ProviderError, readRetryMeta } from "../providers/retry";
import type {
  CanonicalRequest,
  CanonicalStreamChunk,
} from "../providers/types";
import {
  ANTHROPIC_SSE_HEADERS,
  encodeAnthropicStream,
} from "./anthropic-sse-encoder.service";
import * as ApiKeyScope from "./api-key-scope.service";
import * as ComboEngine from "./combo-engine.service";
import * as EventBus from "./event-bus";
import {
  fromCanonical,
  type SourceFormat,
  toCanonical,
} from "./format-translator.service";
import * as ProviderRegistry from "./provider-registry.service";
import * as QuotaTracker from "./quota-tracker.service";
import * as RequestLog from "./request-log.service";
import {
  getCavemanSettings,
  getPonytailSettings,
  getTokenSaverDefault,
  recordTokenSaverSavings,
} from "./settings.service";
import { encodeOpenAIStream, OPENAI_SSE_HEADERS } from "./sse-encoder.service";
import { compress, injectCaveman, injectPonytail } from "./token-saver.service";
import * as UsageRecorder from "./usage-recorder.service";

export interface RouterInput {
  rawBody: unknown;
  sourceFormat: SourceFormat;
  targetSelector: string;
  tokenSaverOverride?: "on" | "off";
  cavemanOverride?: "on" | "off";
  ponytailOverride?: "on" | "off";
  stream: boolean;
  /**
   * Which API key authenticated the request, or null when it did not come
   * through key auth (internal callers, connection tests). A null key is
   * unrestricted — scope only applies to keys that have it configured.
   */
  apiKeyId?: string | null;
}

export interface RouterResult {
  status: number;
  body: unknown | ReadableStream;
  headers: Record<string, string>;
}

interface ParsedModel {
  providerPrefix: string | null;
  modelName: string;
}

interface StreamHandoff {
  modelName: string;
  includeUsage: boolean;
  tokenSaverEstimate: number;
  startedAt: number;
  rawBody: unknown;
  providerAccountId: string;
  comboId: string | null;
  /** In-place retries fetchWithRetry performed before the stream opened. */
  retries: number;
  onComplete: (
    usage: { inputTokens: number; outputTokens: number },
    latencyMs: number,
    collectedChunks: CanonicalStreamChunk[],
  ) => void;
}

/**
 * Turns a canonical chunk stream into an SSE byte stream plus headers.
 *
 * Usage is reported from the encoder's completion hook rather than inline,
 * because the stream can also end via client disconnect — recording it here
 * means a cancelled request still gets accounted for.
 */
function buildStreamResult(
  source: ReadableStream<CanonicalStreamChunk>,
  handoff: StreamHandoff,
  sourceFormat: SourceFormat,
): RouterResult {
  const collectedChunks: CanonicalStreamChunk[] = [];

  const onComplete = (usage: { inputTokens: number; outputTokens: number }) =>
    handoff.onComplete(usage, Date.now() - handoff.startedAt, collectedChunks);

  if (sourceFormat === "anthropic") {
    // Anthropic clients need the stateful Messages event sequence
    // (message_start / content_block_* / message_delta / message_stop);
    // OpenAI SSE frames would look like a silent hang to them.
    const body = encodeAnthropicStream(
      source,
      { model: handoff.modelName },
      onComplete,
      collectedChunks,
    );

    return {
      status: 200,
      body,
      headers: {
        ...ANTHROPIC_SSE_HEADERS,
        "x-router-tokens-saved": String(handoff.tokenSaverEstimate),
      },
    };
  }

  const body = encodeOpenAIStream(
    source,
    { model: handoff.modelName, includeUsage: handoff.includeUsage },
    onComplete,
    collectedChunks,
  );

  return {
    status: 200,
    body,
    headers: {
      ...OPENAI_SSE_HEADERS,
      "x-router-tokens-saved": String(handoff.tokenSaverEstimate),
    },
  };
}

function parseModel(modelStr: string): ParsedModel {
  const slashIndex = modelStr.indexOf("/");
  if (slashIndex === -1) {
    return { providerPrefix: null, modelName: modelStr };
  }
  const prefix = modelStr.slice(0, slashIndex).toLowerCase();
  const model = modelStr.slice(slashIndex + 1);
  return { providerPrefix: prefix, modelName: model };
}

function resolveTokenSaverEnabled(override?: "on" | "off"): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return getTokenSaverDefault();
}

function estimateCost(
  member: { inputCostPer1M: number | null; outputCostPer1M: number | null },
  usage: { inputTokens: number; outputTokens: number },
): number {
  const inputRate = member.inputCostPer1M ?? 0;
  const outputRate = member.outputCostPer1M ?? 0;
  return (
    (usage.inputTokens * inputRate) / 1_000_000 +
    (usage.outputTokens * outputRate) / 1_000_000
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatErrorResponse(
  error: unknown,
  sourceFormat: SourceFormat,
): unknown {
  const message = errorMessage(error);
  if (sourceFormat === "openai") {
    return { error: { message, type: "server_error", code: "upstream_error" } };
  }
  return { type: "error", error: { type: "api_error", message } };
}

function classifyError(err: unknown): "auth" | "rate_limit" | "server_error" {
  const message = err instanceof Error ? err.message : String(err);
  // Prefer the structured status code on ProviderError (set by adapters from
  // the actual response) over free-text matching — an upstream body mentioning
  // "401" or "rate limit" inside a 502 must not be misclassified, since the
  // kind now drives the account cooldown duration.
  if (err instanceof ProviderError) {
    if (err.status === 401 || err.status === 403) return "auth";
    if (err.status === 429) return "rate_limit";
    return "server_error";
  }
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch?.[1] ? Number(statusMatch[1]) : null;
  if (status !== null) {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limit";
    return "server_error";
  }
  if (message.includes("Unauthorized")) return "auth";
  if (message.includes("rate limit")) return "rate_limit";
  return "server_error";
}

/**
 * Extract the upstream `Retry-After` hint carried by a ProviderError, if any.
 * Used to floor the account cooldown so a rate-limited account isn't picked
 * again before the upstream asked us to wait.
 */
function retryAfterFloor(err: unknown): number | undefined {
  if (err instanceof ProviderError && err.retryAfterMs != null) {
    return err.retryAfterMs;
  }
  return undefined;
}

/** Reconstruct a loggable assistant message from collected stream chunks. */
function buildStreamResponseBody(chunks: CanonicalStreamChunk[]): unknown {
  return chunks.map((c) => ({
    role: "assistant" as const,
    content: c.delta ?? "",
    reasoning: c.reasoning,
    toolCalls: c.toolCallStart
      ? [
          {
            id: c.toolCallStart.toolCallId,
            name: c.toolCallStart.toolName,
            arguments: "",
          },
        ]
      : undefined,
  }));
}

interface RecordSuccessInput {
  requestId: string;
  account: ProviderRegistry.ProviderAccount;
  provider: ProviderRegistry.Provider;
  comboId: string | null;
  modelName: string;
  sourceFormat: SourceFormat;
  stream: boolean;
  latencyMs: number;
  retries: number;
  usage: { inputTokens: number; outputTokens: number };
  estimatedCost: number;
  requestBody: string;
  responseBody: unknown;
  /** Key whose token budget this request draws down, if any. */
  apiKeyId: string | null;
}

/**
 * Persist a successful attempt across every sink: usage history, the
 * `request:complete` event, quota accounting, account health, and the request
 * log. Shared verbatim by the streaming and non-streaming paths so the two
 * cannot drift apart.
 */
function recordSuccess(input: RecordSuccessInput): void {
  const {
    requestId,
    account,
    provider,
    comboId,
    modelName,
    sourceFormat,
    stream,
    latencyMs,
    retries,
    usage,
    estimatedCost,
    requestBody,
    responseBody,
    apiKeyId,
  } = input;

  UsageRecorder.record({
    requestId,
    providerAccountId: account.id,
    comboId,
    model: modelName,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    status: "success",
    latencyMs,
    estimatedCost,
    requestBody,
    responseBody: JSON.stringify(responseBody),
  });
  EventBus.publish("request:complete", {
    providerAccountId: account.id,
    comboId,
    model: modelName,
    transport: provider.transport,
    latencyMs,
    retries,
    timestamp: Date.now(),
  });
  QuotaTracker.recordUsage(account.id, usage.inputTokens + usage.outputTokens);
  // Draw the same tokens down against the calling key's budget. Separate from
  // the per-account quota: one key can span providers, and one provider serves
  // many keys.
  if (apiKeyId) {
    ApiKeyScope.recordUsage(apiKeyId, usage.inputTokens + usage.outputTokens);
  }
  ProviderRegistry.recordAccountSuccess(account.id);
  RequestLog.record({
    requestId,
    type: "success",
    source: "router",
    providerAccountId: account.id,
    comboId,
    model: modelName,
    sourceFormat,
    stream,
    message: null,
    latencyMs,
    retries,
  });
}

interface RecordAccountFailureInput {
  requestId: string;
  accountId: string;
  comboId: string | null;
  modelName: string;
  sourceFormat: SourceFormat;
  stream: boolean;
  error: unknown;
  startedAt: number;
  /** The client's request body, persisted so a failure can be inspected. */
  rawBody: unknown;
}

/**
 * Record a failed attempt against one account: mark the account's cooldown,
 * persist the request payload for inspection, and log the error. Returns the
 * human-readable message for the caller to surface if the whole failover chain
 * is exhausted.
 */
function recordAccountFailure(input: RecordAccountFailureInput): string {
  const {
    requestId,
    accountId,
    comboId,
    modelName,
    sourceFormat,
    stream,
    error,
    startedAt,
    rawBody,
  } = input;

  const message = errorMessage(error);
  const latencyMs = Date.now() - startedAt;
  ProviderRegistry.recordAccountError(
    accountId,
    message,
    classifyError(error),
    retryAfterFloor(error),
  );

  // Payloads live on the usage record, keyed by requestId. Only successes used
  // to write one, so a failed request had no inspectable body — exactly the
  // case an operator most wants to look at. Record the attempt with zeroed
  // usage so the payload is retained and the log detail can surface it.
  UsageRecorder.record({
    requestId,
    providerAccountId: accountId,
    comboId,
    model: modelName,
    inputTokens: 0,
    outputTokens: 0,
    status: "error",
    latencyMs,
    estimatedCost: 0,
    requestBody: JSON.stringify(rawBody),
    responseBody: JSON.stringify({ error: message }),
  });

  RequestLog.record({
    requestId,
    type: "error",
    source: "router",
    providerAccountId: accountId,
    comboId,
    model: modelName,
    sourceFormat,
    stream,
    message,
    latencyMs,
    retries: error instanceof ProviderError ? error.retries : undefined,
  });
  return message;
}

interface RoutingErrorInput {
  requestId: string;
  status: number;
  error: unknown;
  comboId: string | null;
  modelName: string;
  sourceFormat: SourceFormat;
  stream: boolean;
  message: string;
}

/**
 * Build a non-account-attributable error response (unknown prefix/combo, no
 * accounts, everything exhausted) and log it. Keeps the many early-return
 * error branches in the route handlers to a single line each.
 */
function routingError(input: RoutingErrorInput): RouterResult {
  const {
    requestId,
    status,
    error,
    comboId,
    modelName,
    sourceFormat,
    stream,
    message,
  } = input;

  RequestLog.record({
    requestId,
    type: "error",
    source: "router",
    providerAccountId: null,
    comboId,
    model: modelName,
    sourceFormat,
    stream,
    message,
    latencyMs: null,
  });
  return {
    status,
    body: formatErrorResponse(error, sourceFormat),
    headers: {},
  };
}

interface AccountAttemptParams {
  requestId: string;
  canonical: CanonicalRequest;
  account: ProviderRegistry.ProviderAccount;
  provider: ProviderRegistry.Provider;
  modelName: string;
  sourceFormat: SourceFormat;
  stream: boolean;
  tokenSaverEstimate: number;
  includeUsage: boolean;
  rawBody: unknown;
  comboId: string | null;
  /** Combo member carrying per-token costs; null for plain prefix routes. */
  cost?: {
    inputCostPer1M: number | null;
    outputCostPer1M: number | null;
  } | null;
  /** Key to bill the resulting tokens to, or null when unauthenticated. */
  apiKeyId: string | null;
}

/**
 * Executes one request attempt against a single provider account.
 * Shared by the prefix route (failover across a provider's accounts) and the
 * combo route (failover across combo members). Throws on upstream failure so
 * the caller can mark the account and try the next one.
 */
async function attemptAccount(
  params: AccountAttemptParams,
): Promise<RouterResult> {
  const {
    requestId,
    canonical,
    account,
    provider,
    modelName,
    sourceFormat,
    stream,
    tokenSaverEstimate,
    includeUsage,
    rawBody,
    comboId,
    cost,
    apiKeyId,
  } = params;

  const adapter = getAdapter(provider.transport);
  const credential = ProviderRegistry.getDecryptedCredential(account.id);
  const startedAt = Date.now();
  const reqWithModel = { ...canonical, modelHint: modelName };
  // Forward the provider's stored retry policy (if any) into the adapter, so
  // fetchWithRetry merges it over the global defaults per status code.
  const adapterOpts = provider.retryConfig
    ? { retry: provider.retryConfig }
    : undefined;

  const estimatedCost = (usage: {
    inputTokens: number;
    outputTokens: number;
  }): number => (cost != null ? estimateCost(cost, usage) : 0);

  if (stream) {
    const streamResult = await adapter.sendStream(
      reqWithModel,
      credential,
      modelName,
      provider.baseUrl,
      adapterOpts,
    );
    const retries = readRetryMeta(streamResult)?.retries ?? 0;

    return buildStreamResult(
      streamResult,
      {
        modelName,
        includeUsage,
        tokenSaverEstimate,
        startedAt,
        rawBody,
        providerAccountId: account.id,
        comboId,
        retries,
        onComplete: (usage, latencyMs, collectedChunks) => {
          recordSuccess({
            requestId,
            account,
            provider,
            comboId,
            modelName,
            sourceFormat,
            stream: true,
            latencyMs,
            retries,
            usage,
            estimatedCost: estimatedCost(usage),
            requestBody: JSON.stringify(rawBody),
            responseBody: buildStreamResponseBody(collectedChunks),
            apiKeyId,
          });
        },
      },
      sourceFormat,
    );
  }

  // Non-streaming
  const response = await adapter.send(
    reqWithModel,
    credential,
    modelName,
    provider.baseUrl,
    adapterOpts,
  );
  const retries = readRetryMeta(response)?.retries ?? 0;
  const latencyMs = Date.now() - startedAt;
  const responseBody = fromCanonical(response, sourceFormat);

  recordSuccess({
    requestId,
    account,
    provider,
    comboId,
    modelName,
    sourceFormat,
    stream: false,
    latencyMs,
    retries,
    usage: response.usage,
    estimatedCost: estimatedCost(response.usage),
    requestBody: JSON.stringify(rawBody),
    responseBody,
    apiKeyId,
  });

  return {
    status: 200,
    body: responseBody,
    headers: {
      "Content-Type": "application/json",
      "x-router-tokens-saved": String(tokenSaverEstimate),
    },
  };
}

async function handlePrefixRoute(
  requestId: string,
  canonical: CanonicalRequest,
  providerPrefix: string,
  modelName: string,
  sourceFormat: SourceFormat,
  stream: boolean,
  tokenSaverEstimate: number,
  includeUsage: boolean,
  rawBody: unknown,
  apiKeyId: string | null,
  restrictions: ApiKeyScope.ApiKeyRestrictions,
): Promise<RouterResult> {
  // Find provider by prefix
  const provider = ProviderRegistry.getProviderByPrefix(providerPrefix);
  if (!provider) {
    const message = `Provider with prefix "${providerPrefix}" not found`;
    return routingError({
      requestId,
      status: 404,
      error: new Error(message),
      comboId: null,
      modelName,
      sourceFormat,
      stream,
      message,
    });
  }

  // The provider and model are both known up front here, so the key's scope
  // resolves in one check rather than per failover hop.
  const denial = ApiKeyScope.checkTarget(restrictions, {
    providerId: provider.id,
    providerName: provider.name,
    providerPrefix: provider.prefix,
    modelName,
    comboId: null,
  });
  if (denial) {
    return routingError({
      requestId,
      status: 403,
      error: new Error(denial.message),
      comboId: null,
      modelName,
      sourceFormat,
      stream,
      message: denial.message,
    });
  }

  // Fail over across the provider's available accounts (skipping any that are
  // inside their post-error cooldown window). This mirrors 9router's
  // account-fallback: a single upstream failure no longer kills the provider.
  const accounts = ProviderRegistry.listAccounts(provider.id);
  const availableAccounts = accounts.filter((a) =>
    ProviderRegistry.isAccountAvailable(a),
  );

  if (availableAccounts.length === 0) {
    const noAccounts = accounts.length === 0;
    // Distinguish "switched off" from "cooling down": reporting a cooldown when
    // every connection is simply disabled sends the operator hunting for an
    // upstream fault that does not exist.
    const allDisabled = !noAccounts && accounts.every((a) => !a.enabled);
    const message = noAccounts
      ? `No accounts found for provider "${provider.name}"`
      : allDisabled
        ? `All connections for provider "${provider.name}" are disabled`
        : `All accounts for provider "${provider.name}" are cooling down`;
    return routingError({
      requestId,
      status: noAccounts ? 404 : 503,
      error: new Error(message),
      comboId: null,
      modelName,
      sourceFormat,
      stream,
      message,
    });
  }

  let lastError: unknown = null;
  for (const account of availableAccounts) {
    const startedAt = Date.now();
    try {
      return await attemptAccount({
        requestId,
        canonical,
        account,
        provider,
        modelName,
        sourceFormat,
        stream,
        tokenSaverEstimate,
        includeUsage,
        rawBody,
        comboId: null,
        cost: null,
        apiKeyId,
      });
    } catch (err) {
      lastError = err;
      recordAccountFailure({
        requestId,
        accountId: account.id,
        comboId: null,
        modelName,
        sourceFormat,
        stream,
        error: err,
        startedAt,
        rawBody,
      });
    }
  }

  const message = errorMessage(
    lastError ??
      new Error(`All accounts for provider "${provider.name}" failed`),
  );
  return routingError({
    requestId,
    status: 502,
    error: lastError ?? new Error(message),
    comboId: null,
    modelName,
    sourceFormat,
    stream,
    message: `All accounts failed: ${message}`,
  });
}

async function handleComboRoute(
  requestId: string,
  canonical: CanonicalRequest,
  comboName: string,
  sourceFormat: SourceFormat,
  stream: boolean,
  tokenSaverEstimate: number,
  includeUsage: boolean,
  rawBody: unknown,
  apiKeyId: string | null,
  restrictions: ApiKeyScope.ApiKeyRestrictions,
): Promise<RouterResult> {
  const combo = ComboEngine.getCombo(comboName);
  if (!combo) {
    const message = `Combo "${comboName}" not found`;
    return routingError({
      requestId,
      status: 404,
      error: new Error(message),
      comboId: null,
      modelName: comboName,
      sourceFormat,
      stream,
      message,
    });
  }

  // The combo itself is checked once — it does not change across failover — so
  // a key scoped away from this combo is refused before any member is tried.
  if (
    restrictions.allowedComboIds != null &&
    !restrictions.allowedComboIds.includes(combo.id)
  ) {
    const message = `This API key is not allowed to use combo "${combo.name}"`;
    return routingError({
      requestId,
      status: 403,
      error: new Error(message),
      comboId: combo.id,
      modelName: comboName,
      sourceFormat,
      stream,
      message,
    });
  }

  const excludedMemberIds: string[] = [];
  /**
   * Members skipped because the key may not reach their provider or model.
   * Tracked separately from upstream failures so an all-denied chain can report
   * a 403 rather than a misleading "members exhausted" 503.
   */
  let lastDenial: ApiKeyScope.Denial | null = null;

  while (true) {
    const member =
      excludedMemberIds.length === 0
        ? ComboEngine.resolveTarget(combo.id)
        : ComboEngine.nextFallback(combo.id, excludedMemberIds);

    if (!member) {
      // Every remaining member was ruled out by the key's scope rather than by
      // an upstream failure, so this is a permissions answer, not capacity.
      if (lastDenial) {
        return routingError({
          requestId,
          status: 403,
          error: new Error(lastDenial.message),
          comboId: combo.id,
          modelName: comboName,
          sourceFormat,
          stream,
          message: lastDenial.message,
        });
      }

      const message = "All combo members exhausted";
      return routingError({
        requestId,
        status: 503,
        error: new Error(message),
        comboId: combo.id,
        modelName: comboName,
        sourceFormat,
        stream,
        message,
      });
    }

    const account = ProviderRegistry.getAccount(member.providerAccountId);
    const provider = account
      ? ProviderRegistry.getProvider(account.providerId)
      : null;
    if (!account || !provider) {
      excludedMemberIds.push(member.id);
      continue;
    }

    // Re-checked on every hop: each member resolves to its own provider and
    // model, so a single up-front check on the combo name would let a key reach
    // targets it was never granted.
    const denial = ApiKeyScope.checkTarget(restrictions, {
      providerId: provider.id,
      providerName: provider.name,
      providerPrefix: provider.prefix,
      modelName: member.modelName,
      comboId: combo.id,
      comboName: combo.name,
    });
    if (denial) {
      lastDenial = denial;
      excludedMemberIds.push(member.id);
      continue;
    }

    const startedAt = Date.now();

    try {
      return await attemptAccount({
        requestId,
        canonical,
        account,
        provider,
        modelName: member.modelName,
        sourceFormat,
        stream,
        tokenSaverEstimate,
        includeUsage,
        rawBody,
        comboId: combo.id,
        cost: member,
        apiKeyId,
      });
    } catch (err) {
      excludedMemberIds.push(member.id);
      recordAccountFailure({
        requestId,
        accountId: account.id,
        comboId: combo.id,
        modelName: member.modelName,
        sourceFormat,
        stream,
        error: err,
        startedAt,
        rawBody,
      });
    }
  }
}

/**
 * OpenAI clients opt into a trailing usage chunk via
 * `stream_options: { include_usage: true }`. Sending it unconditionally breaks
 * stricter clients, so it is only emitted when asked for.
 */
function wantsUsageChunk(rawBody: unknown): boolean {
  if (!rawBody || typeof rawBody !== "object") return false;
  const opts = (rawBody as { stream_options?: { include_usage?: unknown } })
    .stream_options;
  return opts?.include_usage === true;
}

export async function handleChatRequest(
  input: RouterInput,
): Promise<RouterResult> {
  const requestId = randomUUID();

  // 1. Parse + validate
  let canonical: CanonicalRequest;
  try {
    canonical = toCanonical(input.rawBody, input.sourceFormat);
  } catch (err) {
    return routingError({
      requestId,
      status: 400,
      error: err,
      comboId: null,
      modelName: input.targetSelector,
      sourceFormat: input.sourceFormat,
      stream: input.stream,
      message: errorMessage(err),
    });
  }

  // 1b. Log incoming request
  RequestLog.record({
    requestId,
    type: "request",
    source: "router",
    providerAccountId: null,
    comboId: null,
    model: input.targetSelector,
    sourceFormat: input.sourceFormat,
    stream: input.stream,
    message: null,
    latencyMs: null,
  });

  // 2. Token Saver
  const tokenSaverEnabled = resolveTokenSaverEnabled(input.tokenSaverOverride);
  const { messages, tokensSavedEstimate } = compress(
    canonical.messages,
    tokenSaverEnabled,
  );
  canonical.messages = messages;
  recordTokenSaverSavings(tokensSavedEstimate);

  // 2b. Caveman + Ponytail system prompt injection
  const cavemanSettings = getCavemanSettings();
  const cavemanOn =
    input.cavemanOverride === "on" ||
    (input.cavemanOverride !== "off" && cavemanSettings.enabled);
  if (cavemanOn) {
    injectCaveman(
      canonical.messages,
      cavemanSettings.level as "lite" | "full" | "ultra",
    );
  }

  const ponytailSettings = getPonytailSettings();
  const ponytailOn =
    input.ponytailOverride === "on" ||
    (input.ponytailOverride !== "off" && ponytailSettings.enabled);
  if (ponytailOn) {
    injectPonytail(
      canonical.messages,
      ponytailSettings.level as "lite" | "full" | "ultra",
    );
  }

  // 3. Parse model string for prefix
  const { providerPrefix, modelName } = parseModel(input.targetSelector);
  const includeUsage = wantsUsageChunk(input.rawBody);

  // 3b. Resolve the calling key's scope once. A request with no key (internal
  // callers, connection tests) is unrestricted, as is a key with nothing
  // configured — the behaviour every key had before scoping existed.
  const apiKeyId = input.apiKeyId ?? null;
  const restrictions = apiKeyId
    ? (ApiKeyScope.getRestrictions(apiKeyId) ?? ApiKeyScope.UNRESTRICTED)
    : ApiKeyScope.UNRESTRICTED;

  // Tokens are only counted after a response completes, so a request that
  // crosses the cap finishes and the next one is refused here.
  if (apiKeyId && !ApiKeyScope.hasBudget(apiKeyId)) {
    const message =
      "This API key has reached its token limit. Raise the limit or reset its usage.";
    return routingError({
      requestId,
      status: 429,
      error: new Error(message),
      comboId: null,
      modelName: input.targetSelector,
      sourceFormat: input.sourceFormat,
      stream: input.stream,
      message,
    });
  }

  // 4. Route based on prefix or combo
  if (providerPrefix) {
    return handlePrefixRoute(
      requestId,
      canonical,
      providerPrefix,
      modelName,
      input.sourceFormat,
      input.stream,
      tokensSavedEstimate,
      includeUsage,
      input.rawBody,
      apiKeyId,
      restrictions,
    );
  }

  return handleComboRoute(
    requestId,
    canonical,
    input.targetSelector,
    input.sourceFormat,
    input.stream,
    tokensSavedEstimate,
    includeUsage,
    input.rawBody,
    apiKeyId,
    restrictions,
  );
}
