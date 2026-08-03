import { toCanonical, fromCanonical, type SourceFormat } from "./format-translator.service";
import { compress } from "./token-saver.service";
import * as ComboEngine from "./combo-engine.service";
import * as QuotaTracker from "./quota-tracker.service";
import * as UsageRecorder from "./usage-recorder.service";
import * as ProviderRegistry from "./provider-registry.service";
import { getTokenSaverDefault } from "./settings.service";
import { openaiAdapter } from "../adapters/openai-adapter";
import { anthropicAdapter } from "../adapters/anthropic-adapter";
import { geminiAdapter } from "../adapters/gemini-adapter";
import type { ProviderAdapter, CanonicalRequest } from "../adapters/types";
import type { ProviderTransport } from "../../db/schema";

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

function getAdapter(transport: ProviderTransport): ProviderAdapter {
  switch (transport) {
    case "openai":
      return openaiAdapter;
    case "anthropic":
      return anthropicAdapter;
    case "gemini":
      return geminiAdapter;
  }
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
  return (usage.inputTokens * inputRate) / 1_000_000 + (usage.outputTokens * outputRate) / 1_000_000;
}

function formatErrorResponse(error: unknown, sourceFormat: SourceFormat): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (sourceFormat === "openai") {
    return { error: { message, type: "server_error", code: "upstream_error" } };
  }
  return { type: "error", error: { type: "api_error", message } };
}

function classifyError(err: unknown): "auth" | "rate_limit" | "server_error" {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("401") || message.includes("Unauthorized")) return "auth";
  if (message.includes("429") || message.includes("rate limit")) return "rate_limit";
  return "server_error";
}

export async function handleChatRequest(input: RouterInput): Promise<RouterResult> {
  // 1. Parse + validate
  let canonical: CanonicalRequest;
  try {
    canonical = toCanonical(input.rawBody, input.sourceFormat);
  } catch (err) {
    return { status: 400, body: formatErrorResponse(err, input.sourceFormat), headers: {} };
  }

  // 2. Token Saver
  const tokenSaverEnabled = resolveTokenSaverEnabled(input.tokenSaverOverride);
  const { messages, tokensSavedEstimate } = compress(canonical.messages, tokenSaverEnabled);
  canonical.messages = messages;

  // 3. Resolve combo
  const combo = ComboEngine.getCombo(input.targetSelector);
  if (!combo) {
    return {
      status: 404,
      body: formatErrorResponse(new Error(`Combo "${input.targetSelector}" not found`), input.sourceFormat),
      headers: {},
    };
  }

  // 4. Fallback loop
  const excludedMemberIds: string[] = [];

  while (true) {
    const member =
      excludedMemberIds.length === 0
        ? ComboEngine.resolveTarget(combo.id)
        : ComboEngine.nextFallback(combo.id, excludedMemberIds);

    if (!member) {
      return {
        status: 503,
        body: formatErrorResponse(new Error(`All combo members exhausted`), input.sourceFormat),
        headers: {},
      };
    }

    const account = ProviderRegistry.getAccount(member.providerAccountId);
    const provider = account ? ProviderRegistry.getProvider(account.providerId) : null;
    if (!account || !provider) {
      excludedMemberIds.push(member.id);
      lastError = new Error("Provider or account not found");
      continue;
    }

    const adapter = getAdapter(provider.transport);
    const credential = ProviderRegistry.getDecryptedCredential(account.id);
    const startedAt = Date.now();
    const reqWithModel = { ...canonical, modelHint: member.modelName };

    try {
      if (input.stream) {
        const stream = await adapter.sendStream(reqWithModel, credential, member.modelName);

        // Record usage asynchronously (best effort)
        const reader = stream.getReader();
        let outputTokens = 0;
        let inputTokens = 0;

        const transformStream = new ReadableStream({
          async pull(controller) {
            const result = await reader.read();
            if (result.done) {
              controller.close();
              // Record after stream ends
              const latencyMs = Date.now() - startedAt;
              UsageRecorder.record({
                providerAccountId: account.id,
                comboId: combo.id,
                model: member.modelName,
                inputTokens,
                outputTokens,
                status: "success",
                latencyMs,
                estimatedCost: estimateCost(member, { inputTokens, outputTokens }),
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
            "x-router-tokens-saved": String(tokensSavedEstimate),
          },
        };
      }

      // Non-streaming
      const response = await adapter.send(reqWithModel, credential, member.modelName);
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
      QuotaTracker.recordUsage(account.id, response.usage.inputTokens + response.usage.outputTokens);

      return {
        status: 200,
        body: fromCanonical(response, input.sourceFormat),
        headers: {
          "Content-Type": "application/json",
          "x-router-tokens-saved": String(tokensSavedEstimate),
        },
      };
    } catch (err) {
      lastError = err;
      excludedMemberIds.push(member.id);
      QuotaTracker.markError(account.id, classifyError(err));
    }
  }
}
