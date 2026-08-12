import { randomUUID } from "node:crypto";
import { extractSystemText, parseToolArguments } from "../helpers";
import { carryRetryMeta, fetchWithRetry, providerError } from "../retry";
import type {
  CanonicalContentPart,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  ProviderAdapter,
} from "../types";

interface CommandCodeParams {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  system?: string;
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
}

interface CommandCodeBody {
  threadId: string;
  memory: string;
  taste: string;
  skills: string;
  permissionMode: string;
  config: {
    workingDir: string;
    date: string;
    environment: string;
    structure: unknown[];
    isGitRepo: boolean;
    currentBranch: string;
    mainBranch: string;
    gitStatus: string;
    recentCommits: unknown[];
  };
  params: CommandCodeParams;
}

/**
 * Whether a model routed through Command Code is vision-capable.
 * mimo-v2.5-pro is text-only; mimo-v2.5 and mimo-v2-omni accept images.
 */
function isVisionModel(model: string): boolean {
  if (/(?:^|\/)mimo-v2\.5-pro$/i.test(model)) return false;
  if (/(?:^|\/)mimo-v2\.5$/i.test(model)) return true;
  if (/(?:^|\/)mimo-v2-omni$/i.test(model)) return true;
  return /vision|multimodal|omni/i.test(model);
}

/**
 * Extract image URL from OpenAI-format content part.
 * OpenAI:  { type: "image_url", image_url: { url: "..." } }
 * CC CLI:  { type: "image", image: "..." }
 */
function extractImageUrl(part: {
  type: string;
  image?: string;
  image_url?: unknown;
}): string | undefined {
  if (part.type === "image") return part.image;
  if (
    part.type === "image_url" &&
    part.image_url &&
    typeof part.image_url === "object"
  ) {
    const url = (part.image_url as { url?: string }).url;
    return url;
  }
  return undefined;
}

/**
 * Convert user content for Command Code. For vision models, preserves images
 * as `{ type: "image", image: "..." }`. For non-vision models, extracts text
 * only and returns a plain string (the API rejects arrays for text-only turns).
 */
function convertUserContent(
  content: CanonicalContentPart[],
  vision: boolean,
): string | unknown[] {
  if (!vision) {
    return content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }

  const parts: unknown[] = [];
  for (const part of content) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
      continue;
    }
    const imgUrl = extractImageUrl(part);
    if (imgUrl) {
      parts.push({ type: "image", image: imgUrl });
    }
  }
  return parts.length > 0 ? parts : [{ type: "text", text: "" }];
}

// Matches the upstream `/alpha/generate` schema (role at top level, text
// blocks use `text`, tool messages are wrapped in role:"tool").
function convertMessages(
  req: CanonicalRequest,
  model: string,
): {
  messages: unknown[];
  system?: string;
} {
  const messages: unknown[] = [];
  const system = extractSystemText(req);
  const vision = isVisionModel(model);

  for (const msg of req.messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: convertUserContent(msg.content, vision),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const contentParts: unknown[] = [];

      for (const part of msg.content) {
        if (part.type === "text") {
          contentParts.push({ type: "text", text: part.text });
        } else if (part.type === "tool_call") {
          contentParts.push({
            type: "tool-call",
            toolCallId: part.id,
            toolName: part.name,
            input: parseToolArguments(part.arguments),
          });
        }
      }

      messages.push({
        role: "assistant",
        content:
          contentParts.length > 0 ? contentParts : [{ type: "text", text: "" }],
      });
      continue;
    }

    if (msg.role === "tool") {
      const tr = msg.content.find((p) => p.type === "tool_result") as
        | { type: "tool_result"; toolCallId: string; content: string }
        | undefined;
      if (tr) {
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: tr.toolCallId,
              toolName: "",
              output: { type: "text", value: tr.content },
            },
          ],
        });
      }
    }
  }

  return { messages, system };
}

// Bun's fetch sends "User-Agent: Bun/<version>" by default, which is an
// obvious non-CLI fingerprint. Override it (and match Node's more generic
// default) so requests aren't flagged as proxy/bot traffic by upstream.
function buildCommandCodeHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "x-command-code-version": "0.33.2",
    "x-cli-environment": "external",
    "x-project-slug": "pi-cc",
    "x-taste-learning": "false",
    "x-co-flag": "false",
    "x-session-id": randomUUID(),
    "User-Agent": "node",
  };
}

// The upstream stream is newline-delimited JSON (AI SDK v5 style events:
// start / start-step / text-delta / reasoning-delta / finish-step / finish),
// NOT SSE — lines arrive as bare `{"type":...}` with no `data: ` prefix.
// The prefix and [DONE] sentinel are still tolerated so a future switch to
// real SSE framing doesn't silently drop every event again.
function parseEventLine(line: string): Record<string, unknown> | null {
  let raw = line.trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) raw = raw.slice(5).trim();
  if (!raw || raw === "[DONE]") return null;
  if (!raw.startsWith("{")) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface UpstreamUsage {
  inputTokens?: number;
  outputTokens?: number;
}

// Usage is nested and named differently per event: `usage` on finish-step,
// `totalUsage` on finish.
function readUsage(
  event: Record<string, unknown>,
): { inputTokens: number; outputTokens: number } | null {
  const raw = (event.usage ?? event.totalUsage) as UpstreamUsage | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    inputTokens: raw.inputTokens ?? 0,
    outputTokens: raw.outputTokens ?? 0,
  };
}

function buildCommandCodeBody(
  req: CanonicalRequest,
  model: string,
): CommandCodeBody {
  const { messages, system } = convertMessages(req, model);

  const params: CommandCodeParams = {
    model,
    messages,
    stream: req.stream,
    max_tokens: req.maxTokens ? Math.min(req.maxTokens, 200_000) : undefined,
    temperature: req.temperature ?? 0.3,
  };

  if (system) params.system = system;

  if (req.tools && req.tools.length > 0) {
    params.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters ?? { type: "object", properties: {} },
    }));
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    threadId: randomUUID(),
    memory: "",
    taste: "",
    skills: "",
    permissionMode: "standard",
    config: {
      workingDir: process.cwd(),
      date: today,
      // Upstream expects a fixed enum here, not the host platform. Sending
      // e.g. "linux" is rejected as an invalid environment.
      environment: "external",
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    params,
  };
}

const DEFAULT_BASE_URL = "https://api.commandcode.ai";

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/alpha/generate`;
}

export const commandCodeAdapter: ProviderAdapter = {
  transport: "command-code",

  async send(
    req,
    credential,
    model,
    baseUrl,
    opts,
  ): Promise<CanonicalResponse> {
    const body = buildCommandCodeBody(req, model);
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);

    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: buildCommandCodeHeaders(credential.apiKey),
        body: JSON.stringify(body),
      },
      { providerName: "Command Code", retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError("Command Code", res, text);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
      }
    }

    let content = "";
    const toolCalls: Array<{
      toolCallId: string;
      toolName: string;
      input: unknown;
    }> = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finishReason = "stop";

    for (const line of accumulated.split("\n")) {
      const parsed = parseEventLine(line);
      if (!parsed) continue;

      if (parsed.type === "text-delta" && typeof parsed.text === "string") {
        content += parsed.text;
      }
      if (parsed.type === "tool-call") {
        toolCalls.push({
          toolCallId: (parsed.toolCallId as string) ?? `tc_${Date.now()}`,
          toolName: ((parsed.toolName ?? parsed.name) as string) ?? "",
          input: parsed.input ?? {},
        });
      }
      // finish-step carries the same finishReason and arrives first; finish
      // then confirms it. Both are accepted so a truncated stream still
      // reports the real reason.
      if (parsed.type === "finish" || parsed.type === "finish-step") {
        if (typeof parsed.finishReason === "string") {
          finishReason = parsed.finishReason;
        }
      }
      const eventUsage = readUsage(parsed);
      if (eventUsage) usage = eventUsage;
    }

    const parts: CanonicalContentPart[] = [];
    if (content) parts.push({ type: "text", text: content });
    for (const tc of toolCalls) {
      parts.push({
        type: "tool_call",
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: tc.input,
      });
    }

    const finishMap: Record<string, CanonicalResponse["finishReason"]> = {
      stop: "stop",
      length: "length",
      // Upstream reports tool calls as "tool-calls" (AI SDK naming); the
      // underscore form is kept for safety.
      "tool-calls": "tool_call",
      tool_call: "tool_call",
      error: "error",
    };

    return carryRetryMeta(
      {
        message: { role: "assistant", content: parts },
        usage,
        finishReason: finishMap[finishReason] ?? "stop",
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
    const body = buildCommandCodeBody(req, model);
    const url = buildUrl(baseUrl ?? DEFAULT_BASE_URL);

    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: buildCommandCodeHeaders(credential.apiKey),
        body: JSON.stringify(body),
      },
      { providerName: "Command Code", retry: opts?.retry },
    );

    if (!res.ok) {
      const text = await res.text();
      throw providerError("Command Code", res, text);
    }

    if (!res.body) throw new Error("Empty response body");

    const decoder = new TextDecoder();
    let buffer = "";
    const seenToolDeltas = new Set<string>();

    const streamFinishMap: Record<string, "stop" | "length" | "tool_call"> = {
      stop: "stop",
      length: "length",
      "tool-calls": "tool_call",
      tool_call: "tool_call",
    };

    function emit(
      controller: TransformStreamDefaultController<CanonicalStreamChunk>,
      line: string,
    ) {
      const parsed = parseEventLine(line);
      if (!parsed) return;

      if (parsed.type === "text-delta" && typeof parsed.text === "string") {
        controller.enqueue({ delta: parsed.text });
      }

      if (
        parsed.type === "reasoning-delta" &&
        typeof parsed.text === "string"
      ) {
        controller.enqueue({ reasoning: parsed.text });
      }

      if (parsed.type === "tool-input-start") {
        const toolCallId = (parsed.id ||
          parsed.toolCallId ||
          `tc_${Date.now()}`) as string;
        const toolName = (parsed.toolName || "") as string;
        seenToolDeltas.add(toolCallId);
        controller.enqueue({ toolCallStart: { toolCallId, toolName } });
      }

      if (parsed.type === "tool-input-delta") {
        const toolCallId = (parsed.id || parsed.toolCallId) as string;
        const args = (parsed.delta || parsed.inputTextDelta || "") as string;
        if (toolCallId && args) {
          seenToolDeltas.add(toolCallId);
          controller.enqueue({
            toolCallDelta: { toolCallId, arguments: args },
          });
        }
      }

      if (parsed.type === "tool-call") {
        const toolCallId = parsed.toolCallId as string;
        if (toolCallId && !seenToolDeltas.has(toolCallId)) {
          const toolName = (parsed.toolName || parsed.name || "") as string;
          const input =
            typeof parsed.input === "string"
              ? parsed.input
              : JSON.stringify(parsed.input ?? {});
          controller.enqueue({
            toolCallStart: { toolCallId, toolName },
            toolCallDelta: { toolCallId, arguments: input },
          });
        }
        controller.enqueue({ finishReason: "tool_call" });
      }

      if (parsed.type === "finish" || parsed.type === "finish-step") {
        const reason =
          typeof parsed.finishReason === "string"
            ? parsed.finishReason
            : "stop";
        controller.enqueue({
          finishReason: streamFinishMap[reason] ?? "stop",
        });
      }

      const usage = readUsage(parsed);
      if (usage) controller.enqueue({ usage });
    }

    return carryRetryMeta(
      res.body.pipeThrough(
        new TransformStream<Uint8Array, CanonicalStreamChunk>({
          transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) emit(controller, line);
          },
          flush(controller) {
            if (buffer.trim()) emit(controller, buffer);
            seenToolDeltas.clear();
          },
        }),
      ),
      res,
    );
  },
};
