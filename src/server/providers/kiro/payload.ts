/**
 * Builds the Kiro wire payload from a CanonicalRequest.
 *
 * This is the most complex part of the Kiro adapter because Kiro enforces
 * strict conversation-shape rules:
 *   - History must open with a user turn
 *   - Turns must strictly alternate user/assistant
 *   - toolResults must be preceded by an assistant toolUses turn
 *   - Tools schema lives on currentMessage only, not history
 *   - System messages are inlined into the first user message
 */
import { randomUUID } from "node:crypto";
import { extractSystemText, parseToolArguments } from "../helpers";
import type { CanonicalRequest } from "../types";
import {
  convertTools,
  normalizeModelId,
  serializeToolResultContent,
  wrapSystemMessage,
} from "./schema";
import type { KiroMessage, KiroToolResult } from "./types";

/**
 * Every toolResults array must be preceded by an assistant turn carrying
 * toolUses. Orphans (truncated history) are inlined as text instead.
 */
function inlineOrphanedToolResults(
  msg: KiroMessage | undefined,
  prev: KiroMessage | undefined,
): void {
  const ctx = msg?.userInputMessage?.userInputMessageContext;
  if (!ctx?.toolResults) return;
  if ((prev?.assistantResponseMessage?.toolUses?.length ?? 0) > 0) return;

  const text = ctx.toolResults
    .map((tr) => {
      const body = tr.content.map((c) => c.text).join("\n");
      return tr.toolUseId
        ? `[Tool Result (${tr.toolUseId})]\n${body}`
        : `[Tool Result]\n${body}`;
    })
    .join("\n\n");

  const original = msg?.userInputMessage?.content ?? "";
  if (msg?.userInputMessage) {
    msg.userInputMessage.content = original ? `${original}\n\n${text}` : text;
  }
  delete ctx.toolResults;
  if (Object.keys(ctx).length === 0) {
    delete msg?.userInputMessage?.userInputMessageContext;
  }
}

/** Translates canonical messages into Kiro's wire format. */
function translateMessages(
  req: CanonicalRequest,
  normalizedModel: string,
): {
  history: KiroMessage[];
  currentMessage: KiroMessage;
} {
  const history: KiroMessage[] = [];
  let systemContent = extractSystemText(req) ?? "";
  const pendingToolResults: KiroToolResult[] = [];

  for (const msg of req.messages) {
    if (msg.role === "system") continue;

    // Collect tool results (from tool-role or user-role messages)
    if (msg.role === "tool" || msg.role === "user") {
      for (const part of msg.content) {
        if (part.type === "tool_result") {
          pendingToolResults.push({
            toolUseId: part.toolCallId,
            status: "success",
            content: [{ text: serializeToolResultContent(part.content) }],
          });
        }
      }
    }

    if (msg.role === "tool") continue;

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

      if (pendingToolResults.length > 0 && userMsg.userInputMessage) {
        userMsg.userInputMessage.userInputMessageContext = {
          toolResults: pendingToolResults.splice(0),
        };
      }

      history.push(userMsg);
      continue;
    }

    if (msg.role === "assistant") {
      // Flush pending tool results BEFORE the assistant turn to maintain
      // the tool_use → tool_result chain required by Kiro. Without this,
      // tool results end up at the end of history, after the next assistant
      // turn, causing 400 TOOL_USE_RESULT_MISMATCH.
      if (pendingToolResults.length > 0) {
        const text = pendingToolResults
          .flatMap((r) => r.content.map((c) => c.text))
          .join("\n\n");
        history.push({
          userInputMessage: {
            content: text || "...",
            modelId: normalizedModel,
            origin: "AI_EDITOR",
            userInputMessageContext: {
              toolResults: pendingToolResults.splice(0),
            },
          },
        });
      }

      const content = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n");

      const assistantMsg: KiroMessage = {
        assistantResponseMessage: {
          content: content || "(empty)",
        },
      };

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
            input: parseToolArguments(tc.arguments),
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

  // Trailing tool results with no following user turn become their own turn.
  if (pendingToolResults.length > 0) {
    const text = pendingToolResults
      .flatMap((r) => r.content.map((c) => c.text))
      .join("\n\n");

    history.push({
      userInputMessage: {
        content: text || "...",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
        userInputMessageContext: { toolResults: pendingToolResults.splice(0) },
      },
    });
  }

  // Kiro requires history to open with a user turn.
  if (history.length > 0 && history[0]?.assistantResponseMessage) {
    history.unshift({
      userInputMessage: {
        content: "(empty)",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
      },
    });
  }

  // Kiro requires strictly alternating user/assistant turns.
  const alternating: KiroMessage[] = [];
  for (const item of history) {
    const last = alternating[alternating.length - 1];
    if (item.userInputMessage && last?.userInputMessage) {
      alternating.push({ assistantResponseMessage: { content: "(empty)" } });
    }
    alternating.push(item);
  }

  // Kiro requires currentMessage to be a user turn.
  let currentMessage: KiroMessage;
  if (alternating[alternating.length - 1]?.userInputMessage) {
    currentMessage = alternating.pop() as KiroMessage;
  } else {
    currentMessage = {
      userInputMessage: {
        content: "...",
        modelId: normalizedModel,
        origin: "AI_EDITOR",
      },
    };
  }

  // Inline orphaned tool results.
  alternating.forEach((item, i) => {
    inlineOrphanedToolResults(item, alternating[i - 1]);
  });
  inlineOrphanedToolResults(
    currentMessage,
    alternating[alternating.length - 1],
  );

  return { history: alternating, currentMessage };
}

/** Synthesizes minimal tool specs from history when caller sent none. */
function resolveTools(
  kiroTools: Record<string, unknown>[] | null,
  history: KiroMessage[],
  currentMessage: KiroMessage,
): Record<string, unknown>[] | null {
  let toolsForRequest = kiroTools;

  if (!toolsForRequest) {
    const seen = new Set<string>();
    const synthesized: Record<string, unknown>[] = [];
    for (const item of [...history, currentMessage]) {
      for (const use of item.assistantResponseMessage?.toolUses ?? []) {
        if (!use.name || seen.has(use.name)) continue;
        seen.add(use.name);
        synthesized.push({
          toolSpecification: {
            name: use.name,
            description: `Tool: ${use.name}`,
            inputSchema: {
              json: { type: "object", properties: {}, required: [] },
            },
          },
        });
      }
    }
    if (synthesized.length > 0) toolsForRequest = synthesized;
  }

  return toolsForRequest;
}

export function buildKiroPayload(
  req: CanonicalRequest,
  model: string,
): Record<string, unknown> {
  const normalizedModel = normalizeModelId(model);

  const kiroTools =
    req.tools && req.tools.length > 0 ? convertTools(req.tools) : null;

  const { history, currentMessage } = translateMessages(req, normalizedModel);

  // Synthesize missing tool schemas from history.
  const toolsForRequest = resolveTools(kiroTools, history, currentMessage);

  // Tools schema belongs on currentMessage only.
  if (toolsForRequest && currentMessage.userInputMessage) {
    currentMessage.userInputMessage.userInputMessageContext = {
      ...(currentMessage.userInputMessage.userInputMessageContext ?? {}),
      tools: toolsForRequest,
    };
  }

  // Strip tools from history turns — Kiro validates against currentMessage.
  for (const item of history) {
    const ctx = item.userInputMessage?.userInputMessageContext;
    if (!ctx) continue;
    delete ctx.tools;
    if (Object.keys(ctx).length === 0) {
      delete item.userInputMessage?.userInputMessageContext;
    }
  }

  const payload: Record<string, unknown> = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: randomUUID(),
      currentMessage,
      history,
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
