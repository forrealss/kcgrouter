/**
 * Shared reasoning-text extraction for `reasoningContentEvent` frames.
 *
 * The payload comes in several shapes (plain string, `reasoningText` string,
 * nested `reasoningText.text`/`reasoningText.Text`, or a top-level `text`), so
 * both the streaming and non-streaming paths use this single implementation to
 * avoid drift.
 */
export function extractReasoningText(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload) return "";
  const rt = payload.reasoningText;
  if (typeof rt === "string") return rt;
  if (rt && typeof rt === "object") {
    const o = rt as { text?: unknown; Text?: unknown };
    return typeof o.text === "string"
      ? o.text
      : typeof o.Text === "string"
        ? o.Text
        : "";
  }
  return typeof payload.text === "string" ? payload.text : "";
}
