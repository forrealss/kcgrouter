/**
 * Builds the Antigravity wire payload from a CanonicalRequest.
 *
 * Antigravity (Google Cloud Code `v1internal`) accepts Gemini-shaped requests
 * wrapped in an IDE envelope:
 *
 *   {
 *     project: "<projectId>",
 *     model: "<upstream model id>",
 *     userAgent: "antigravity",
 *     requestType: "agent",
 *     requestId: "agent/<conversation>/<ts>/<trajectory>/<step>",
 *     request: { contents, systemInstruction, generationConfig, tools, ... }
 *   }
 *
 * Mirrors 9router's AntigravityExecutor.transformRequest: thinking fields are
 * stripped (Google rejects them), function names are sanitized to Gemini's
 * charset, and tool schemas get a default object shape when missing.
 */
import { createHash, randomUUID } from "node:crypto";
import { extractSystemText, parseToolArguments } from "../helpers";
import type { CanonicalRequest } from "../types";

/** Gemini rejects unknown thinking/reasoning fields at the body root. */
const BLACKLISTED_FIELDS = [
  "output_config",
  "thinking",
  "reasoning_effort",
  "reasoning",
  "enable_thinking",
  "thinking_budget",
  "thinkingConfig",
];

function stripBlacklisted(obj: Record<string, unknown>): void {
  for (const key of BLACKLISTED_FIELDS) delete obj[key];
}

/** Gemini requires [a-zA-Z_][a-zA-Z0-9_.:\-]{0,63} for tool names. */
export function sanitizeFunctionName(name: string): string {
  if (!name) return "_unknown";
  let s = name.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  if (!/^[a-zA-Z_]/.test(s)) s = `_${s}`;
  return s.substring(0, 64) || "_unknown";
}

export const MAX_OUTPUT_TOKENS = 64_000;

/**
 * Deterministic UUIDv5-style id seeded from a string, so retries of the same
 * conversation reuse the same conversation/trajectory ids (matches 9router's
 * uuidFromSeed).
 */
function uuidFromSeed(seed: string): string {
  const bytes = Array.from(
    createHash("sha256").update(seed).digest().subarray(0, 16),
  );
  // Set the UUID version (5) and variant bits, matching 9router's uuidFromSeed.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * IDE-style request id: agent/<conversation>/<ts>/<trajectory>/<step>.
 * Conversation and trajectory are derived from the model + a stable session
 * key so a failing retry sequence looks like one agent session upstream.
 */
export function buildRequestId(
  sessionKey: string,
  model: string,
  contentCount: number,
): string {
  const conversationId = uuidFromSeed(`antigravity:conversation:${sessionKey}`);
  const trajectoryId = uuidFromSeed(
    `antigravity:trajectory:${sessionKey}:${model}`,
  );
  const step = Math.max(1, contentCount * 2 - 1);
  return `agent/${conversationId}/${Date.now()}/${trajectoryId}/${step}`;
}

/** Fallback projectId — matches 9router's adjective-noun-hash scheme. */
export function generateProjectId(): string {
  const adjectives = ["useful", "bright", "swift", "calm", "bold"];
  const nouns = ["fuze", "wave", "spark", "flow", "core"];
  const pick = (arr: string[], fallback: string): string =>
    arr[Math.floor(Math.random() * arr.length)] ?? fallback;
  return `${pick(adjectives, "bright")}-${pick(nouns, "fuze")}-${randomUUID().slice(0, 5)}`;
}

interface GeminiContent {
  role: string;
  parts: Record<string, unknown>[];
}

/** Translate canonical messages into Gemini contents (role user/model). */
function buildContents(req: CanonicalRequest): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const m of req.messages) {
    const parts: Record<string, unknown>[] = [];

    for (const part of m.content) {
      if (part.type === "text") {
        parts.push({ text: part.text });
      } else if (part.type === "tool_call") {
        parts.push({
          functionCall: {
            name: sanitizeFunctionName(part.name),
            args: parseToolArguments(part.arguments) ?? {},
          },
        });
      } else if (part.type === "tool_result") {
        // Gemini functionResponse must carry the *tool name* — canonical only
        // has the call id, so use a stable synthetic name.
        parts.push({
          functionResponse: {
            name: "tool",
            response: { result: part.content },
          },
        });
      }
      // Image parts: Antigravity accepts inlineData only; canonical images are
      // data or remote URLs. Remote URLs are dropped (matches gemini adapter).
    }

    if (parts.length === 0) continue;

    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    // Merge consecutive same-role turns — Google rejects adjacent equal roles.
    if (last && last.role === role) {
      last.parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  return contents;
}

interface ToolDeclaration {
  name: string;
  description?: string;
  parameters?: unknown;
}

function buildTools(
  req: CanonicalRequest,
): { functionDeclarations: ToolDeclaration[] }[] {
  if (!req.tools || req.tools.length === 0) return [];

  const seen = new Set<string>();
  const declarations: ToolDeclaration[] = [];

  for (const tool of req.tools) {
    const name = sanitizeFunctionName(tool.name);
    if (seen.has(name)) continue;
    seen.add(name);
    declarations.push({
      name,
      description: tool.description,
      // Google rejects empty/missing parameters — give it a no-op schema.
      parameters:
        tool.parameters && typeof tool.parameters === "object"
          ? tool.parameters
          : {
              type: "object",
              properties: {
                reason: { type: "string", description: "Brief explanation" },
              },
              required: ["reason"],
            },
    });
  }

  return declarations.length > 0
    ? [{ functionDeclarations: declarations }]
    : [];
}

export interface AntigravityPayloadOptions {
  projectId?: string;
  /** Stable per-account key (account id or email) for request-id seeding. */
  sessionKey: string;
}

export function buildAntigravityPayload(
  req: CanonicalRequest,
  model: string,
  opts: AntigravityPayloadOptions,
): Record<string, unknown> {
  const projectId = opts.projectId || generateProjectId();
  const contents = buildContents(req);

  const generationConfig: Record<string, unknown> = {};
  if (req.maxTokens != null) {
    generationConfig.maxOutputTokens = Math.min(
      req.maxTokens,
      MAX_OUTPUT_TOKENS,
    );
  }
  if (req.temperature != null) generationConfig.temperature = req.temperature;

  const tools = buildTools(req);

  const request: Record<string, unknown> = {
    contents,
    sessionId: randomUUID() + Date.now().toString(),
  };
  if (Object.keys(generationConfig).length > 0) {
    request.generationConfig = generationConfig;
  }

  const system = extractSystemText(req);
  if (system) {
    request.systemInstruction = {
      parts: system.split("\n").map((text) => ({ text })),
    };
  }
  if (tools.length > 0) {
    request.tools = tools;
    // VALIDATED mode asks the backend to validate tool calls server-side.
    request.toolConfig = { functionCallingConfig: { mode: "VALIDATED" } };
  }
  stripBlacklisted(request);

  return {
    project: projectId,
    model,
    userAgent: "antigravity",
    requestType: "agent",
    requestId: buildRequestId(opts.sessionKey, model, contents.length),
    request,
  };
}
