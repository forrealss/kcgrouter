import { randomUUID } from "node:crypto";
import type {
  CanonicalContentPart,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";
import { parseEventFrame } from "./eventstream";
import { buildKiroPayload } from "./payload";
import { createKiroStream } from "./stream";

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

  async send(req, credential, model, baseUrl): Promise<CanonicalResponse> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const body = buildKiroPayload(req, model);

    const res = await fetch(url, {
      method: "POST",
      headers: buildKiroHeaders(credential.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kiro API error ${res.status}: ${text}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    let content = "";
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: unknown;
    }> = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finishReason: CanonicalResponse["finishReason"] = "stop";

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

      if (eventType === "assistantResponseEvent" && frame.payload) {
        content = (frame.payload.content as string) ?? "";
      }

      if (eventType === "toolUseEvent" && frame.payload) {
        toolCalls.push({
          id: (frame.payload.toolUseId as string) ?? `tc_${Date.now()}`,
          name: (frame.payload.name as string) ?? "",
          arguments: frame.payload.input ?? {},
        });
      }

      if (eventType === "metricsEvent" && frame.payload) {
        usage = {
          inputTokens: (frame.payload.inputTokens as number) ?? 0,
          outputTokens: (frame.payload.outputTokens as number) ?? 0,
        };
      }

      if (eventType === "messageStopEvent") {
        finishReason = toolCalls.length > 0 ? "tool_call" : "stop";
      }
    }

    const parts: CanonicalContentPart[] = [];
    if (content) parts.push({ type: "text", text: content });
    for (const tc of toolCalls) {
      parts.push({
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      });
    }

    return {
      message: { role: "assistant", content: parts },
      usage,
      finishReason,
    };
  },

  async sendStream(
    req,
    credential,
    model,
    baseUrl,
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);
    const body = buildKiroPayload(req, model);

    const res = await fetch(url, {
      method: "POST",
      headers: buildKiroHeaders(credential.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kiro API error ${res.status}: ${text}`);
    }

    return createKiroStream(res);
  },
};
