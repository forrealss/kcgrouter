import { getAdapter } from "../providers/registry";
import type { CanonicalRequest } from "../providers/types";
import * as ComboEngine from "./combo-engine.service";
import {
  fromCanonical,
  type SourceFormat,
  toCanonical,
} from "./format-translator.service";
import * as ProviderRegistry from "./provider-registry.service";
import * as QuotaTracker from "./quota-tracker.service";
import {
  getTokenSaverDefault,
  recordTokenSaverSavings,
} from "./settings.service";
import { compress } from "./token-saver.service";
import * as UsageRecorder from "./usage-recorder.service";

export interface RouterInput {
  rawBody: unknown;
  sourceFormat: SourceFormat;
  targetSelector: string;
  tokenSaverOverride?: "on" | "off";
  stream: boolean;
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

function formatErrorResponse(
  error: unknown,
  sourceFormat: SourceFormat,
): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (sourceFormat === "openai") {
    return { error: { message, type: "server_error", code: "upstream_error" } };
  }
  return { type: "error", error: { type: "api_error", message } };
}

function classifyError(err: unknown): "auth" | "rate_limit" | "server_error" {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("401") || message.includes("Unauthorized"))
    return "auth";
  if (message.includes("429") || message.includes("rate limit"))
    return "rate_limit";
  return "server_error";
}

async function handlePrefixRoute(
  canonical: CanonicalRequest,
  providerPrefix: string,
  modelName: string,
  sourceFormat: SourceFormat,
  stream: boolean,
  tokenSaverEstimate: number,
): Promise<RouterResult> {
  // Find provider by prefix
  const provider = ProviderRegistry.getProviderByPrefix(providerPrefix);
  if (!provider) {
    return {
      status: 404,
      body: formatErrorResponse(
        new Error(`Provider with prefix "${providerPrefix}" not found`),
        sourceFormat,
      ),
      headers: {},
    };
  }

  // Find first available account for this provider
  const accounts = ProviderRegistry.listAccounts(provider.id);
  const activeAccount = accounts.find((a) => a.status === "active");

  if (!activeAccount) {
    return {
      status: 404,
      body: formatErrorResponse(
        new Error(`No active account found for provider "${provider.name}"`),
        sourceFormat,
      ),
      headers: {},
    };
  }

  const adapter = getAdapter(provider.transport);
  const credential = ProviderRegistry.getDecryptedCredential(activeAccount.id);
  const startedAt = Date.now();
  const reqWithModel = { ...canonical, modelHint: modelName };

  try {
    if (stream) {
      const streamResult = await adapter.sendStream(
        reqWithModel,
        credential,
        modelName,
      );

      const reader = streamResult.getReader();
      let outputTokens = 0;
      let inputTokens = 0;

      const transformStream = new ReadableStream({
        async pull(controller) {
          const result = await reader.read();
          if (result.done) {
            controller.close();
            const latencyMs = Date.now() - startedAt;
            UsageRecorder.record({
              providerAccountId: activeAccount.id,
              comboId: null,
              model: modelName,
              inputTokens,
              outputTokens,
              status: "success",
              latencyMs,
              estimatedCost: 0,
            });
            QuotaTracker.recordUsage(
              activeAccount.id,
              inputTokens + outputTokens,
            );
            return;
          }
          const chunk = result.value;
          if (chunk.usage) {
            inputTokens = chunk.usage.inputTokens;
            outputTokens = chunk.usage.outputTokens;
          }
          controller.enqueue(chunk);
        },
      });

      return {
        status: 200,
        body: transformStream,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "x-router-tokens-saved": String(tokenSaverEstimate),
        },
      };
    }

    // Non-streaming
    const response = await adapter.send(reqWithModel, credential, modelName);
    const latencyMs = Date.now() - startedAt;

    UsageRecorder.record({
      providerAccountId: activeAccount.id,
      comboId: null,
      model: modelName,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "success",
      latencyMs,
      estimatedCost: 0,
    });
    QuotaTracker.recordUsage(
      activeAccount.id,
      response.usage.inputTokens + response.usage.outputTokens,
    );

    return {
      status: 200,
      body: fromCanonical(response, sourceFormat),
      headers: {
        "Content-Type": "application/json",
        "x-router-tokens-saved": String(tokenSaverEstimate),
      },
    };
  } catch (err) {
    return {
      status: 502,
      body: formatErrorResponse(err, sourceFormat),
      headers: {},
    };
  }
}

async function handleComboRoute(
  canonical: CanonicalRequest,
  comboName: string,
  sourceFormat: SourceFormat,
  stream: boolean,
  tokenSaverEstimate: number,
): Promise<RouterResult> {
  const combo = ComboEngine.getCombo(comboName);
  if (!combo) {
    return {
      status: 404,
      body: formatErrorResponse(
        new Error(`Combo "${comboName}" not found`),
        sourceFormat,
      ),
      headers: {},
    };
  }

  const excludedMemberIds: string[] = [];

  while (true) {
    const member =
      excludedMemberIds.length === 0
        ? ComboEngine.resolveTarget(combo.id)
        : ComboEngine.nextFallback(combo.id, excludedMemberIds);

    if (!member) {
      return {
        status: 503,
        body: formatErrorResponse(
          new Error(`All combo members exhausted`),
          sourceFormat,
        ),
        headers: {},
      };
    }

    const account = ProviderRegistry.getAccount(member.providerAccountId);
    const provider = account
      ? ProviderRegistry.getProvider(account.providerId)
      : null;
    if (!account || !provider) {
      excludedMemberIds.push(member.id);
      continue;
    }

    const adapter = getAdapter(provider.transport);
    const credential = ProviderRegistry.getDecryptedCredential(account.id);
    const startedAt = Date.now();
    const reqWithModel = { ...canonical, modelHint: member.modelName };

    try {
      if (stream) {
        const streamResult = await adapter.sendStream(
          reqWithModel,
          credential,
          member.modelName,
        );

        const reader = streamResult.getReader();
        let outputTokens = 0;
        let inputTokens = 0;

        const transformStream = new ReadableStream({
          async pull(controller) {
            const result = await reader.read();
            if (result.done) {
              controller.close();
              const latencyMs = Date.now() - startedAt;
              UsageRecorder.record({
                providerAccountId: account.id,
                comboId: combo.id,
                model: member.modelName,
                inputTokens,
                outputTokens,
                status: "success",
                latencyMs,
                estimatedCost: estimateCost(member, {
                  inputTokens,
                  outputTokens,
                }),
              });
              QuotaTracker.recordUsage(account.id, inputTokens + outputTokens);
              return;
            }
            const chunk = result.value;
            if (chunk.usage) {
              inputTokens = chunk.usage.inputTokens;
              outputTokens = chunk.usage.outputTokens;
            }
            controller.enqueue(chunk);
          },
        });

        return {
          status: 200,
          body: transformStream,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "x-router-tokens-saved": String(tokenSaverEstimate),
          },
        };
      }

      // Non-streaming
      const response = await adapter.send(
        reqWithModel,
        credential,
        member.modelName,
      );
      const latencyMs = Date.now() - startedAt;

      UsageRecorder.record({
        providerAccountId: account.id,
        comboId: combo.id,
        model: member.modelName,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        status: "success",
        latencyMs,
        estimatedCost: estimateCost(member, response.usage),
      });
      QuotaTracker.recordUsage(
        account.id,
        response.usage.inputTokens + response.usage.outputTokens,
      );

      return {
        status: 200,
        body: fromCanonical(response, sourceFormat),
        headers: {
          "Content-Type": "application/json",
          "x-router-tokens-saved": String(tokenSaverEstimate),
        },
      };
    } catch (err) {
      excludedMemberIds.push(member.id);
      QuotaTracker.markError(account.id, classifyError(err));
    }
  }
}

export async function handleChatRequest(
  input: RouterInput,
): Promise<RouterResult> {
  // 1. Parse + validate
  let canonical: CanonicalRequest;
  try {
    canonical = toCanonical(input.rawBody, input.sourceFormat);
  } catch (err) {
    return {
      status: 400,
      body: formatErrorResponse(err, input.sourceFormat),
      headers: {},
    };
  }

  // 2. Token Saver
  const tokenSaverEnabled = resolveTokenSaverEnabled(input.tokenSaverOverride);
  const { messages, tokensSavedEstimate } = compress(
    canonical.messages,
    tokenSaverEnabled,
  );
  canonical.messages = messages;
  recordTokenSaverSavings(tokensSavedEstimate);

  // 3. Parse model string for prefix
  const { providerPrefix, modelName } = parseModel(input.targetSelector);

  // 4. Route based on prefix or combo
  if (providerPrefix) {
    return handlePrefixRoute(
      canonical,
      providerPrefix,
      modelName,
      input.sourceFormat,
      input.stream,
      tokensSavedEstimate,
    );
  }

  return handleComboRoute(
    canonical,
    input.targetSelector,
    input.sourceFormat,
    input.stream,
    tokensSavedEstimate,
  );
}
