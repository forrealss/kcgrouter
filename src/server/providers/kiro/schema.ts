/**
 * Schema sanitization and tool conversion for Kiro.
 *
 * Kiro/CodeWhisperer rejects certain JSON-Schema keywords and enforces
 * strict tool-name length limits. This module handles all pre-flight
 * sanitization before the payload is assembled.
 */
import { createHash } from "node:crypto";
import type { CanonicalToolDefinition } from "../types";
import { MAX_TOOL_NAME_LENGTH, SCHEMA_STRIP_KEYS } from "./types";

/** Recursively drops unsupported schema keys and empty `required` arrays. */
export function stripSchemaKeys(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSchemaKeys);

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SCHEMA_STRIP_KEYS.has(key)) continue;
    if (key === "required" && Array.isArray(val) && val.length === 0) continue;
    cleaned[key] = stripSchemaKeys(val);
  }
  return cleaned;
}

/**
 * Serializes tool-result content for Kiro. An empty string is rejected with
 * 400 "Improperly formed request", so it degrades to a placeholder instead.
 */
export function serializeToolResultContent(content: unknown): string {
  if (typeof content === "string") return content || "(no output)";
  if (content === null || content === undefined) return "(no output)";
  try {
    return JSON.stringify(content) || "(no output)";
  } catch {
    return "(no output)";
  }
}

/** Wraps system instructions in Kiro's expected format. */
export function wrapSystemMessage(content: string): string {
  return `[Context: System instructions]\n\n<system-reminder>\n${content}\n</system-reminder>`;
}

/** Converts `claude-sonnet-4-5` → `claude-sonnet-4.5` (dash to dot for version). */
export function normalizeModelId(model: string): string {
  return model.replace(/-(\d)-(\d)/g, ".$1.$2");
}

/** Converts CanonicalToolDefinitions to Kiro's wire format. */
export function convertTools(
  tools: CanonicalToolDefinition[],
): Record<string, unknown>[] {
  return tools.map((t) => {
    // Kiro rejects tool names longer than 64 chars; hash-truncate to stay
    // deterministic so the same tool always maps to the same wire name.
    let name = t.name;
    if (name.length > MAX_TOOL_NAME_LENGTH) {
      const hash = createHash("sha256").update(name).digest("hex").slice(0, 7);
      name = `${name.slice(0, 56)}_${hash}`;
    }

    const raw = t.parameters;
    const schema =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (stripSchemaKeys(raw) as Record<string, unknown>)
        : { type: "object", properties: {} };

    // Kiro expects the `required` key to be present on the top-level schema.
    if (!schema.required) schema.required = [];

    return {
      toolSpecification: {
        name,
        description: t.description || `Tool: ${t.name}`,
        inputSchema: { json: schema },
      },
    };
  });
}
