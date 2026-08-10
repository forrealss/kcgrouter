/**
 * Rough character-based estimator for Anthropic's `/v1/messages/count_tokens`.
 *
 * This is intentionally NOT a real tokenizer — Anthropic counts tokens with a
 * server-side BPE tokenizer, which this proxy cannot call for non-Anthropic
 * upstreams. Instead we approximate with the classic heuristic of ~4 characters
 * per token, which is accurate enough for the endpoint's real job: letting
 * clients like Claude Code gauge context-window fit and request size before
 * sending the actual request.
 *
 * All Anthropic content shapes are handled: plain strings, content block
 * arrays (`text`, `tool_use`, `tool_result`, `thinking`), and nested `system`
 * arrays, mirroring what counts toward the upstream input.
 */

function countValueChars(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).length;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countValueChars(item), 0);
  }
  if (typeof value === "object") {
    return Object.entries(value).reduce(
      (total, [key, item]) => total + key.length + countValueChars(item),
      0,
    );
  }
  return 0;
}

function countContentBlockChars(block: unknown): number {
  if (block == null) return 0;
  if (typeof block === "string") return block.length;
  if (typeof block !== "object") return countValueChars(block);

  const typed = block as {
    type?: string;
    text?: unknown;
    name?: unknown;
    input?: unknown;
    content?: unknown;
    thinking?: unknown;
  };
  switch (typed.type) {
    case "text":
      return countValueChars(typed.text);
    case "tool_use":
      return countValueChars(typed.name) + countValueChars(typed.input);
    case "tool_result":
      return countValueChars(typed.content);
    case "thinking":
      return countValueChars(typed.thinking);
    default:
      return countValueChars(block);
  }
}

function countMessageChars(message: unknown): number {
  if (!message || typeof message !== "object") return 0;
  const content = (message as { content?: unknown }).content;

  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce(
      (total, block) => total + countContentBlockChars(block),
      0,
    );
  }
  return countValueChars(content);
}

export function estimateAnthropicInputTokens(
  body: Record<string, unknown> = {},
): number {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  let totalChars = countValueChars(body.system) + countValueChars(body.tools);

  for (const msg of messages) {
    totalChars += countMessageChars(msg);
  }

  return Math.ceil(totalChars / 4);
}
