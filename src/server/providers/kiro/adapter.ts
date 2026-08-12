import { randomUUID } from "node:crypto";
import { carryRetryMeta, fetchWithRetry, providerError } from "../retry";
import type {
  CanonicalContentPart,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";
import { parseEventFrame } from "./eventstream";
import { kiroModels } from "./models";
import { buildKiroPayload } from "./payload";
import { extractReasoningText } from "./reasoning";
import { createKiroStream } from "./stream";
import { KIRO_DEBUG } from "./types";
import {
  estimateKiroUsage,
  parseKiroMetering,
  parseKiroTokenUsage,
} from "./usage";

/** Resolves the model context window used for the token-usage fallback. */
function resolveContextWindow(model: string): number {
  const id = model.split("/").pop() ?? model;
  return kiroModels.find((m) => m.id === id)?.contextLength ?? 200_000;
}

const DEFAULT_BASE_URL = "https://codewhisperer.us-east-1.amazonaws.com";

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/generateAssistantResponse`;
}

function buildKiroHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/vnd.amazon.eventstream",
    "X-Amz-Target":
      "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
    "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
    "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
    "Amz-Sdk-Request": "attempt=1; max=3",
    "Amz-Sdk-Invocation-Id": randomUUID(),
    "x-amzn-bedrock-cache-control": "enable",
    tokentype: "API_KEY",
    Authorization: `Bearer ${apiKey}`,
  };
}

export const kiroAdapter: ProviderAdapter = {
  transport: "kiro",

  async send(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<CanonicalResponse> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const body = buildKiroPayload(req, model);

    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: buildKiroHeaders(credential.apiKey),
        body: JSON.stringify(body),
      },
      { providerName: "Kiro", retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError("Kiro", res, text);
    }

    const arrayBuffer = await res.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    let content = "";
    let outputChars = 0;
    let contextUsagePercentage = 0;
    const toolCallsById = new Map<
      string,
      { id: string; name: string; arguments: unknown }
    >();
    let anonymousToolCounter = 0;
    let usage = { inputTokens: 0, outputTokens: 0 };

    let offset = 0;
    while (offset < data.length) {
      if (offset + 4 > data.length) break;

      const totalLength = new DataView(
        data.buffer,
        data.byteOffset,
        data.length,
      ).getUint32(offset, false);
      if (totalLength < 16 || offset + totalLength > data.length) break;

      const frameData = data.subarray(offset, offset + totalLength);
      const frame = parseEventFrame(frameData);
      offset += totalLength;

      if (!frame) continue;

      const eventType = frame.headers[":event-type"];

      // Kiro splits content across many frames — accumulate, don't overwrite.
      if (eventType === "assistantResponseEvent" && frame.payload) {
        const text = (frame.payload.content as string) ?? "";
        content += text;
        outputChars += text.length;
      }

      // Code blocks are part of the answer — same as the streaming path.
      if (
        eventType === "codeEvent" &&
        typeof frame.payload?.content === "string"
      ) {
        content += frame.payload.content;
        outputChars += frame.payload.content.length;
      }

      if (eventType === "reasoningContentEvent") {
        // Deliberately dropped — canonical responses have no reasoning channel.
        // Chars still count toward the output-token estimate (streaming parity).
        outputChars += extractReasoningText(frame.payload).length;
      }

      // A single frame can carry an array of tool uses, and `input` arrives
      // either as incremental JSON fragments or a growing partial object.
      if (eventType === "toolUseEvent" && frame.payload) {
        const uses = Array.isArray(frame.payload)
          ? frame.payload
          : [frame.payload];

        for (const use of uses as Array<Record<string, unknown>>) {
          const toolUseId =
            (use.toolUseId as string) ??
            `tc_${Date.now()}_${anonymousToolCounter++}`;
          const name = (use.name as string) ?? "";
          const input = use.input;

          let entry = toolCallsById.get(toolUseId);
          if (!entry) {
            entry = { id: toolUseId, name, arguments: "" };
            toolCallsById.set(toolUseId, entry);
          }

          if (typeof input === "string") {
            // Incremental JSON fragments — concatenate, don't overwrite.
            const base =
              typeof entry.arguments === "string" ? entry.arguments : "";
            entry.arguments = base + input;
          } else if (input !== null && typeof input === "object") {
            // Partial object that grows upstream — keep the latest shape.
            entry.arguments = input;
          }
        }
      }

      // `metricsEvent`/`usageEvent` are the only frames carrying real tokens.
      if (eventType === "metricsEvent" || eventType === "usageEvent") {
        const tokens = parseKiroTokenUsage(eventType, frame.payload);
        if (tokens) usage = tokens;
      }

      if (eventType === "contextUsageEvent" && frame.payload) {
        const pct = Number(frame.payload.contextUsagePercentage);
        if (Number.isFinite(pct)) contextUsagePercentage = pct;
      }

      if (eventType === "meteringEvent" && KIRO_DEBUG) {
        // Credits, not tokens — logged for diagnostics only (see usage.ts).
        const metering = parseKiroMetering(frame.payload);
        if (metering) {
          console.log("[kiro] meteringEvent", JSON.stringify(metering));
        }
      }
    }

    // Kiro often sends no token data — estimate from context usage + chars.
    if (usage.inputTokens === 0 && usage.outputTokens === 0) {
      usage = estimateKiroUsage(
        contextUsagePercentage,
        outputChars,
        resolveContextWindow(model),
      );
    }

    // Derived from tool calls regardless of which terminal marker (if any)
    // arrived, matching the streaming path.
    const finishReason: CanonicalResponse["finishReason"] =
      toolCallsById.size > 0 ? "tool_call" : "stop";

    const parts: CanonicalContentPart[] = [];
    if (content) parts.push({ type: "text", text: content });
    for (const tc of toolCallsById.values()) {
      parts.push({
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        // Preserve the historical `{}` default for input-less tool calls — an
        // empty string would be invalid JSON for downstream clients.
        arguments: tc.arguments === "" ? {} : tc.arguments,
      });
    }

    return carryRetryMeta(
      {
        message: { role: "assistant", content: parts },
        usage,
        finishReason,
      },
      res,
    );
  },

  async sendStream(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const body = buildKiroPayload(req, model);

    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: buildKiroHeaders(credential.apiKey),
        body: JSON.stringify(body),
      },
      { providerName: "Kiro", retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError("Kiro", res, text);
    }

    return carryRetryMeta(
      createKiroStream(res, resolveContextWindow(model)),
      res,
    );
  },
};
