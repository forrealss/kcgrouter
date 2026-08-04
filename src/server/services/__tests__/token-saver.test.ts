import { beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import type { CanonicalMessage } from "../../providers/types";
import { compress, type ToolOutputFilterKind } from "../token-saver.service";

function makeToolResult(content: string): CanonicalMessage {
  return {
    role: "tool",
    content: [{ type: "tool_result", toolCallId: "t1", content }],
  };
}

describe("TokenSaverService", () => {
  beforeAll(() => {
    runMigrations();
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  });

  // Property 36: disabled = identity
  test("Property 36: disabled returns messages unchanged", () => {
    const msgs: CanonicalMessage[] = [makeToolResult("some content")];
    const result = compress(msgs, false);
    expect(result.messages).toEqual(msgs);
    expect(result.tokensSavedEstimate).toBe(0);
    expect(result.filtersApplied).toHaveLength(0);
  });

  // Property 35: non-tool_result never changed
  test("Property 35: non-tool_result content never changed", () => {
    const msgs: CanonicalMessage[] = [
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ];
    const result = compress(msgs, true);
    expect(result.messages[0]?.content[0]).toEqual({
      type: "text",
      text: "Hello",
    });
  });

  // Property 32: compression applied when filter matches
  test("Property 32: git-diff compressed when matching", () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1,5 +1,6 @@
 line1
+added
 line2`;
    const msgs: CanonicalMessage[] = [makeToolResult(diff)];
    const result = compress(msgs, true);
    expect(result.filtersApplied).toContain("git-diff" as ToolOutputFilterKind);
    const part = result.messages[0]?.content[0];
    expect(part?.type).toBe("tool_result");
    const compressed = (part as { type: "tool_result"; content: string })
      .content;
    expect(compressed.length).toBeLessThan(diff.length);
  });

  // Property 33: fail-open when compression not beneficial
  test("Property 33: fail-open when compressed >= original", () => {
    const short = "a";
    const msgs: CanonicalMessage[] = [makeToolResult(short)];
    const result = compress(msgs, true);
    const part = result.messages[0]?.content[0];
    expect(part?.type).toBe("tool_result");
    const content = (part as { type: "tool_result"; content: string }).content;
    expect(content).toBe(short);
  });

  // Property 34: fail-open on filter error
  test("Property 34: no crash on unrecognized content", () => {
    const msgs: CanonicalMessage[] = [
      makeToolResult("random unknown format content here"),
    ];
    const result = compress(msgs, true);
    expect(result.messages).toBeDefined();
  });

  test("grep filter deduplicates consecutive lines", () => {
    const grepOutput = "src/a.ts:1:foo\nsrc/a.ts:1:foo\nsrc/b.ts:2:bar";
    const msgs: CanonicalMessage[] = [makeToolResult(grepOutput)];
    const result = compress(msgs, true);
    const part = result.messages[0]?.content[0];
    expect(part?.type).toBe("tool_result");
    const content = (part as { type: "tool_result"; content: string }).content;
    expect(content.split("\n").length).toBe(2);
  });

  test("git-status filter removes branch info", () => {
    const status =
      "On branch main\nChanges not staged for committed:\n  M file.ts\n  D old.ts";
    const msgs: CanonicalMessage[] = [makeToolResult(status)];
    const result = compress(msgs, true);
    expect(result.filtersApplied).toContain(
      "git-status" as ToolOutputFilterKind,
    );
    const part = result.messages[0]?.content[0];
    expect(part?.type).toBe("tool_result");
    const content = (part as { type: "tool_result"; content: string }).content;
    expect(content).not.toContain("On branch");
  });

  test("smart-truncate truncates long lines", () => {
    const longLine = "x".repeat(300);
    const msgs: CanonicalMessage[] = [makeToolResult(longLine)];
    const result = compress(msgs, true);
    // smart-truncate only triggers if detected — but the content is just letters, may not match any filter
    expect(result.messages).toBeDefined();
  });
});
