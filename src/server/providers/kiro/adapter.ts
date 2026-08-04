import { randomUUID } from "node:crypto";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";
import { ByteQueue, parseEventFrame } from "./eventstream";
import {
  flushPendingThinking,
  type KiroThinkingState,
  splitInlineThinking,
} from "./thinking";

// --- Request Translation: OpenAI -> Kiro ---

interface KiroMessage {
  userInputMessage?: {
    content: string;
    modelId: string;
    origin: string;
  };
  assistantResponseMessage?: {
    content: string;
    toolUses?: Array<{
      toolUseId: string;
      name: string;
      input: unknown;
    }>;
  };
}

function normalizeModelId(model: string): string {
  // claude-sonnet-4-5 -> claude-sonnet-4.5 (dash to dot for version)
  return model.replace(/-(\d)-(\d)/g, ".$1.$2");
}

function wrapSystemMessage(content: string): string {
  return `[Context: System instructions]\n\n<system-reminder>\n${content}\n</system-reminder>`;
}

function buildKiroPayload(
  req: CanonicalRequest,
  model: string,
): Record<string, unknown> {
  const normalizedModel = normalizeModelId(model);
  const history: KiroMessage[] = [];
  let currentMessage: KiroMessage | null = null;

  // Process messages into Kiro format
  let systemContent = "";
  const pendingToolResults: Array<{
    toolUseId: string;
    status: string;
    content: string;
  }> = [];

  for (const msg of req.messages) {
    // Collect system messages
    if (msg.role === "system") {
      systemContent = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");
      continue;
    }

    // Collect tool results
    if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type === "tool_result") {
          pendingToolResults.push({
            toolUseId: part.toolCallId,
            status: "success",
            content: part.content,
          });
        }
      }
      continue;
    }

    // User message
    if (msg.role === "user") {
      let content = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");

      if (systemContent) {
        content = `${wrapSystemMessage(systemContent)}\n\n${content}`;
        systemContent = "";
      }

      const userMsg: KiroMessage = {
        userInputMessage: {
          content,
          modelId: normalizedModel,
          origin: "AI_EDITOR",
        },
      };

      // Attach pending tool results to user context
      if (pendingToolResults.length > 0) {
        (
          userMsg.userInputMessage as Record<string, unknown>
        ).userInputMessageContext = {
          toolResults: pendingToolResults.splice(0),
        };
      }

      history.push(userMsg);
      currentMessage = userMsg;
      continue;
    }

    // Assistant message
    if (msg.role === "assistant") {
      const content = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");

      const assistantMsg: KiroMessage = {
        assistantResponseMessage: {
          content: content || "(empty)",
        },
      };

      // Collect tool uses
      const toolUses = msg.content
        .filter((p) => p.type === "tool_call")
        .map((p) => {
          const tc = p as {
            type: "tool_call";
            id: string;
            name: string;
            arguments: unknown;
          };
          return {
            toolUseId: tc.id,
            name: tc.name,
            input:
              typeof tc.arguments === "string"
                ? JSON.parse(tc.arguments)
                : tc.arguments,
          };
        });

      if (toolUses.length > 0) {
        (
          assistantMsg.assistantResponseMessage as Record<string, unknown>
        ).toolUses = toolUses;
      }

      history.push(assistantMsg);
    }
  }

  // If no user message found, create a placeholder
  if (!currentMessage) {
    currentMessage = {
      userInputMessage: {
        content: "...",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
      },
    };
    history.push(currentMessage);
  }

  // Build the final payload
  const payload: Record<string, unknown> = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: randomUUID(),
      currentMessage: currentMessage.userInputMessage,
      history: history.slice(0, -1), // history excludes currentMessage
    },
    inferenceConfig: {
      maxTokens: req.maxTokens ?? 4096,
    },
  };

  if (req.temperature !== undefined) {
    (payload.inferenceConfig as Record<string, unknown>).temperature =
      req.temperature;
  }

  return payload;
}

// --- KiroAdapter ---

export const kiroAdapter: ProviderAdapter = {
  transport: "kiro",

  async send(req, credential, model): Promise<CanonicalResponse> {
    const url =
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";

    const body = buildKiroPayload(req, model);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.amazon.eventstream",
        "X-Amz-Target":
          "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
        "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
        "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
        "Amz-Sdk-Request": "attempt=1; max=3",
        "Amz-Sdk-Invocation-Id": randomUUID(),
        "x-amzn-bedrock-cache-control": "enable",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kiro API error ${res.status}: ${text}`);
    }

    // Read the full binary response
    const arrayBuffer = await res.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Parse the binary frame
    const frame = parseEventFrame(data);
    if (!frame) {
      throw new Error("Failed to parse Kiro response frame");
    }

    // Extract content from the frame
    let content = "";
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: unknown;
    }> = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finishReason: CanonicalResponse["finishReason"] = "stop";

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
  ): Promise<ReadableStream<CanonicalStreamChunk>> {
    const url =
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";

    const body = buildKiroPayload(req, model);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.amazon.eventstream",
        "X-Amz-Target":
          "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
        "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
        "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
        "Amz-Sdk-Request": "attempt=1; max=3",
        "Amz-Sdk-Invocation-Id": randomUUID(),
        "x-amzn-bedrock-cache-control": "enable",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kiro API error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    const queue = new ByteQueue();
    let stopSeen = false;
    const thinkingState: KiroThinkingState = {
      thinkingMode: false,
      pendingTag: "",
    };
    let usage = { inputTokens: 0, outputTokens: 0 };

    // Buffer for tool arguments (Kiro streams partial objects)
    const toolArgsBuffer = new Map<string, unknown>();

    return new ReadableStream({
      async pull(controller) {
        if (!reader) {
          controller.close();
          return;
        }

        // Read and queue data
        const { done, value } = await reader.read();
        if (value) {
          queue.push(value);
        }

        // Process complete frames
        while (queue.length >= 4) {
          const totalLength = queue.peekUint32BE(0);
          if (totalLength === null || queue.length < totalLength) break;

          const frameData = queue.read(totalLength);
          if (!frameData) break;

          const frame = parseEventFrame(frameData);
          if (!frame) continue;

          const eventType = frame.headers[":event-type"];

          // Handle reasoning content
          if (eventType === "reasoningContentEvent" && frame.payload) {
            const text =
              (frame.payload.reasoningText as string) ??
              (frame.payload.text as string) ??
              "";
            if (text) {
              controller.enqueue({ delta: text });
            }
          }

          // Handle assistant response (may contain inline thinking)
          if (eventType === "assistantResponseEvent" && frame.payload) {
            const rawContent = (frame.payload.content as string) ?? "";
            if (rawContent) {
              splitInlineThinking(
                thinkingState,
                rawContent,
                (s) => controller.enqueue({ delta: s }),
                (s) => controller.enqueue({ delta: s }),
              );
            }
          }

          // Handle tool use (buffer arguments)
          if (eventType === "toolUseEvent" && frame.payload) {
            const toolUseId =
              (frame.payload.toolUseId as string) ?? `tc_${Date.now()}`;
            const input = frame.payload.input;

            if (!toolArgsBuffer.has(toolUseId)) {
              // First time seeing this tool - emit start
              controller.enqueue({
                delta: "",
                finishReason: "tool_call",
              });
            }
            toolArgsBuffer.set(toolUseId, input);
          }

          // Handle metrics
          if (eventType === "metricsEvent" && frame.payload) {
            usage = {
              inputTokens: (frame.payload.inputTokens as number) ?? 0,
              outputTokens: (frame.payload.outputTokens as number) ?? 0,
            };
          }

          // Handle message stop
          if (eventType === "messageStopEvent") {
            stopSeen = true;
          }
        }

        // If stream is done and we've processed everything
        if (done && queue.length === 0) {
          // Flush pending thinking
          flushPendingThinking(
            thinkingState,
            (s) => controller.enqueue({ delta: s }),
            (s) => controller.enqueue({ delta: s }),
          );

          // Emit finish
          if (!stopSeen) {
            controller.enqueue({
              delta: "",
              finishReason: "stop",
              usage,
            });
          }

          controller.close();
        }
      },
    });
  },
};
