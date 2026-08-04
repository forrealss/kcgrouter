/**
 * Inline thinking splitter for Kiro/CodeWhisperer.
 * Handles <thinking>...</thinking> tags in Claude responses.
 * Ported from OmniRouter's open-sse/executors/kiroThinking.ts
 */

export interface KiroThinkingState {
  thinkingMode: boolean;
  pendingTag: string;
}

const PARTIAL_MAX = 11; // longest tag: "</thinking>" = 11 chars

export function splitInlineThinking(
  state: KiroThinkingState,
  raw: string | null | undefined,
  onContent: (s: string) => void,
  onReasoning: (s: string) => void,
): void {
  let text = (state.pendingTag || "") + (raw || "");
  state.pendingTag = "";

  while (text.length > 0) {
    const target = state.thinkingMode ? "</thinking>" : "<thinking>";
    const idx = text.indexOf(target);

    if (idx === -1) {
      // No full tag found. Hold back characters that might be the start of the tag.
      let holdFrom = text.length;
      for (
        let i = Math.max(0, text.length - PARTIAL_MAX);
        i < text.length;
        i++
      ) {
        const tail = text.slice(i);
        if (target.startsWith(tail) && tail.length > 0) {
          holdFrom = i;
          break;
        }
      }
      const flushable = text.slice(0, holdFrom);
      if (flushable) {
        if (state.thinkingMode) onReasoning(flushable);
        else onContent(flushable);
      }
      state.pendingTag = text.slice(holdFrom);
      return;
    }

    // Found a complete tag. Flush before-tag content, flip mode, continue.
    const before = text.slice(0, idx);
    if (before) {
      if (state.thinkingMode) onReasoning(before);
      else onContent(before);
    }
    state.thinkingMode = !state.thinkingMode;
    text = text.slice(idx + target.length);
  }
}

export function flushPendingThinking(
  state: KiroThinkingState,
  onContent: (s: string) => void,
  onReasoning: (s: string) => void,
): void {
  if (!state.pendingTag) return;
  const leftover = state.pendingTag;
  state.pendingTag = "";
  if (state.thinkingMode) onReasoning(leftover);
  else onContent(leftover);
}
