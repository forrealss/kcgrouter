import type {
  CanonicalContentPart,
  CanonicalMessage,
  CanonicalRequest,
  CanonicalResponse,
  CanonicalToolDefinition,
} from "../providers/types";

export type SourceFormat = "openai" | "anthropic";

// --- OpenAI Format Types ---

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: {
    type: "function";
    function: { name: string; description?: string; parameters?: unknown };
  }[];
}

// --- Anthropic Format Types ---

interface AnthropicMessage {
  role: "user" | "assistant";
  content:
    | string
    | {
        type: string;
        text?: string;
        tool_use_id?: string;
        name?: string;
        input?: unknown;
        content?: string;
      }[];
}

interface AnthropicRequest {
  model?: string;
  system?: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: {
    name: string;
    description?: string;
    input_schema?: unknown;
  }[];
}

// --- FormatTranslator ---

export function toCanonical(
  body: unknown,
  sourceFormat: SourceFormat,
): CanonicalRequest {
  if (sourceFormat === "openai")
    return openAIToCanonical(body as OpenAIRequest);
  if (sourceFormat === "anthropic")
    return anthropicToCanonical(body as AnthropicRequest);
  throw new Error(`Unknown source format: ${sourceFormat}`);
}

export function fromCanonical(
  response: CanonicalResponse,
  targetFormat: SourceFormat,
): unknown {
  if (targetFormat === "openai") return canonicalToOpenAI(response);
  if (targetFormat === "anthropic") return canonicalToAnthropic(response);
  throw new Error(`Unknown target format: ${targetFormat}`);
}

// --- OpenAI -> Canonical ---

function openAIToCanonical(body: OpenAIRequest): CanonicalRequest {
  if (!body.messages || !Array.isArray(body.messages)) {
    throw new Error("Invalid OpenAI request: missing messages array");
  }

  const messages: CanonicalMessage[] = body.messages.map((m) => {
    const parts: CanonicalContentPart[] = [];

    if (m.content && m.role !== "tool") {
      parts.push({ type: "text", text: m.content });
    }

    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        let parsedArgs: unknown;
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          parsedArgs = tc.function.arguments;
        }
        parts.push({
          type: "tool_call",
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    if (m.role === "tool" && m.tool_call_id) {
      parts.push({
        type: "tool_result",
        toolCallId: m.tool_call_id,
        content: m.content ?? "",
      });
    }

    const role = m.role === "tool" ? ("tool" as const) : m.role;

    return { role, content: parts, toolCallId: m.tool_call_id };
  });

  const tools: CanonicalToolDefinition[] | undefined = body.tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));

  return {
    messages,
    modelHint: body.model,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    stream: body.stream ?? false,
    tools,
  };
}

// --- Anthropic -> Canonical ---

function anthropicToCanonical(body: AnthropicRequest): CanonicalRequest {
  if (!body.messages || !Array.isArray(body.messages)) {
    throw new Error("Invalid Anthropic request: missing messages array");
  }

  const messages: CanonicalMessage[] = [];

  // System message
  if (body.system) {
    messages.push({
      role: "system",
      content: [{ type: "text", text: body.system }],
    });
  }

  for (const m of body.messages) {
    const parts: CanonicalContentPart[] = [];

    if (typeof m.content === "string") {
      parts.push({ type: "text", text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === "text" && block.text) {
          parts.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use" && block.id && block.name) {
          parts.push({
            type: "tool_call",
            id: block.id,
            name: block.name,
            arguments: block.input ?? {},
          });
        } else if (block.type === "tool_result" && block.tool_use_id) {
          parts.push({
            type: "tool_result",
            toolCallId: block.tool_use_id,
            content: block.content ?? "",
          });
        }
      }
    }

    messages.push({ role: m.role, content: parts });
  }

  const tools: CanonicalToolDefinition[] | undefined = body.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));

  return {
    messages,
    modelHint: body.model,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    stream: body.stream ?? false,
    tools,
  };
}

// --- Canonical -> OpenAI ---

function canonicalToOpenAI(response: CanonicalResponse): unknown {
  const content = response.message.content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");

  const toolCalls = response.message.content
    .filter((p) => p.type === "tool_call")
    .map((p) => {
      const tc = p as {
        type: "tool_call";
        id: string;
        name: string;
        arguments: unknown;
      };
      return {
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments:
            typeof tc.arguments === "string"
              ? tc.arguments
              : JSON.stringify(tc.arguments),
        },
      };
    });

  const finishReasonMap: Record<string, string> = {
    stop: "stop",
    length: "length",
    tool_call: "tool_calls",
    error: "stop",
  };

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReasonMap[response.finishReason] ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: response.usage.inputTokens,
      completion_tokens: response.usage.outputTokens,
      total_tokens: response.usage.inputTokens + response.usage.outputTokens,
    },
  };
}

// --- Canonical -> Anthropic ---

function canonicalToAnthropic(response: CanonicalResponse): unknown {
  const contentBlocks: unknown[] = [];

  for (const part of response.message.content) {
    if (part.type === "text") {
      contentBlocks.push({ type: "text", text: part.text });
    } else if (part.type === "tool_call") {
      contentBlocks.push({
        type: "tool_use",
        id: part.id,
        name: part.name,
        input:
          typeof part.arguments === "string"
            ? JSON.parse(part.arguments)
            : part.arguments,
      });
    }
  }

  const stopReasonMap: Record<string, string> = {
    stop: "end_turn",
    length: "max_tokens",
    tool_call: "tool_use",
    error: "end_turn",
  };

  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: contentBlocks,
    stop_reason: stopReasonMap[response.finishReason] ?? "end_turn",
    usage: {
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
    },
  };
}
