import type { CanonicalMessage } from "../providers/types";

const SEP = "\n\n";

/**
 * Inject a prompt instruction into the system message of canonical messages.
 * If no system message exists, one is prepended.
 */
export function injectSystemPrompt(
  messages: CanonicalMessage[],
  prompt: string,
): void {
  if (!messages.length || !prompt) return;

  const sysIdx = messages.findIndex((m) => m.role === "system");

  if (sysIdx >= 0) {
    const msg = messages[sysIdx];
    if (!msg) return;

    const parts = msg.content;
    if (parts.length === 0) {
      parts.push({ type: "text", text: prompt });
    } else {
      // Append to the last text part
      const lastTextIdx = parts.findLastIndex((p) => p.type === "text");
      if (lastTextIdx >= 0) {
        const part = parts[lastTextIdx];
        if (part && part.type === "text") {
          part.text = `${part.text}${SEP}${prompt}`;
        }
      } else {
        parts.push({ type: "text", text: prompt });
      }
    }
  } else {
    messages.unshift({
      role: "system",
      content: [{ type: "text", text: prompt }],
    });
  }
}
