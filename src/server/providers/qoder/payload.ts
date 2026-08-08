/**
 * Builds the exact request shape Qoder's chat endpoint expects, ported from
 * 9router's executors/qoder.js (buildQoderRequestBody):
 *   - chat_context with mirrored modelConfig
 *   - business block with stable IDs
 *   - system text hoisted out of the messages array
 *   - per-model `model_config` block (silently downgrades upstream when wrong)
 */

import { createHash, randomUUID } from "node:crypto";

import { buildOpenAIMessages } from "../helpers";
import type { CanonicalRequest } from "../types";
import type { QoderModelConfig } from "./model-catalog";

export interface QoderRequestPlan {
  qoderKey: string;
  payload: Record<string, unknown>;
}

function buildToolsParam(
  req: CanonicalRequest,
): Record<string, unknown>[] | undefined {
  if (!req.tools || req.tools.length === 0) return undefined;
  return req.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Hoist role:"system" messages out of the messages array (Qoder rejects
 * system in messages) and flatten any multipart content arrays.
 */
export function normalizeMessages(messages: unknown[]): {
  messages: unknown[];
  systemText: string;
} {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], systemText: "" };
  }
  const systemParts: string[] = [];
  const out: unknown[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const rec = msg as Record<string, unknown>;
    const text = extractText(rec.content);
    if (rec.role === "system") {
      if (text) systemParts.push(text);
      continue;
    }
    out.push({ ...rec, content: text });
  }
  return { messages: out, systemText: systemParts.join("\n\n") };
}

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if (rec.type === "text" && typeof rec.text === "string") {
          parts.push(rec.text);
        } else if (typeof rec.text === "string") {
          parts.push(rec.text);
        }
      }
    }
    return parts.join("\n");
  }
  return String(content);
}

function lastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown } | undefined;
    if (m?.role === "user" && typeof m.content === "string") {
      return m.content;
    }
  }
  return "";
}

function stableHash(prefix: string, ...parts: unknown[]): string {
  const h = createHash("sha256");
  h.update(prefix);
  for (const p of parts) {
    h.update("\0");
    h.update(String(p ?? ""));
  }
  return h.digest("hex").slice(0, 16);
}

function stableChatRecordId(
  model: string,
  messages: unknown[],
  tools: unknown,
  maxTokens: number,
): string {
  const h = createHash("sha256");
  h.update("qoder-record\0");
  h.update(String(model));
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const rec = m as { role?: string; content?: unknown };
    if (rec.role) {
      h.update("\0");
      h.update(rec.role);
    }
    if (typeof rec.content === "string" && rec.content) {
      h.update("\0");
      h.update(rec.content);
    }
  }
  if (tools) {
    h.update("\0");
    try {
      h.update(JSON.stringify(tools));
    } catch {
      // un-serializable tools are skipped
    }
  }
  h.update(`\0mt=${maxTokens}`);
  return h.digest("hex").slice(0, 16);
}

function truncate(s: string, n: number): string {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || "";
}

/**
 * Map a canonical request into the exact Qoder chat payload.
 *
 * @param req canonical request (already token-saver/format normalized)
 * @param model upstream model key (e.g. "ultimate" or "qoder/ultimate")
 * @param modelConfig live model_config block from the catalog (or fallback)
 * @param userId stable Qoder user id (for session/record IDs)
 * @returns the payload plus the bare model key
 */
export function buildQoderRequestBody(
  req: CanonicalRequest,
  model: string,
  modelConfig: QoderModelConfig,
  userId: string,
): QoderRequestPlan {
  const qoderKey = String(model || "").replace(/^qoder\//, "");

  const openAIMessages = buildOpenAIMessages(req);
  const { messages, systemText } = normalizeMessages(openAIMessages);
  const tools = buildToolsParam(req);
  const isReasoning = !!modelConfig.is_reasoning;
  const maxOutputTokens = Number(modelConfig.max_output_tokens) || 0;

  let maxTokens = 32_768;
  if (maxOutputTokens > 0) maxTokens = maxOutputTokens;
  if (
    typeof req.maxTokens === "number" &&
    req.maxTokens > 0 &&
    req.maxTokens < maxTokens
  ) {
    maxTokens = req.maxTokens;
  }

  const lastUser = lastUserText(messages);
  const sessionId = stableHash("qoder-session", userId, qoderKey);
  const recordId = stableChatRecordId(qoderKey, messages, tools, maxTokens);

  return {
    qoderKey,
    payload: {
      request_id: randomUUID(),
      request_set_id: recordId,
      chat_record_id: recordId,
      session_id: sessionId,
      stream: true,
      chat_task: "FREE_INPUT",
      is_reply: true,
      is_retry: false,
      source: 1,
      version: "3",
      session_type: "qodercli",
      agent_id: "agent_common",
      task_id: "common",
      code_language: "",
      chat_prompt: "",
      image_urls: null,
      aliyun_user_type: "",
      system: systemText,
      messages,
      tools: Array.isArray(tools) ? tools : [],
      parameters: { max_tokens: maxTokens },
      chat_context: {
        chatPrompt: "",
        imageUrls: null,
        extra: {
          context: [],
          modelConfig: { key: qoderKey, is_reasoning: isReasoning },
          originalContent: lastUser,
        },
        features: [],
        text: lastUser,
      },
      model_config: modelConfig,
      business: {
        product: "cli",
        version: "1.0.0",
        type: "agent",
        stage: "start",
        id: randomUUID(),
        name: truncate(lastUser, 30),
        begin_at: Date.now(),
      },
    },
  };
}
