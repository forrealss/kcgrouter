/**
 * Schema sanitization and tool conversion for Kiro.
 *
 * Kiro/CodeWhisperer rejects certain JSON-Schema keywords and enforces
 * strict tool-name length limits. This module handles all pre-flight
 * sanitization before the payload is assembled.
 */
import { createHash } from "node:crypto";
import type { CanonicalToolDefinition } from "../types";
import {
  type KiroImage,
  MAX_TOOL_NAME_LENGTH,
  SCHEMA_STRIP_KEYS,
} from "./types";

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
  if (Array.isArray(content)) {
    // Block arrays (Anthropic tool_result content): keep text, replace images
    // with a short placeholder so base64 blobs never leak into the text body.
    const parts: string[] = [];
    for (const block of content as Array<Record<string, unknown>>) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        if (block.text) parts.push(block.text);
      } else if (block.type === "image" || block.type === "image_url") {
        parts.push("[image attached]");
      } else {
        try {
          const str = JSON.stringify(block);
          if (str && str !== "{}") parts.push(str);
        } catch {
          // skip unserializable block
        }
      }
    }
    return parts.join("\n") || "(no output)";
  }
  try {
    return JSON.stringify(content) || "(no output)";
  } catch {
    return "(no output)";
  }
}

/** Only Claude models on Kiro accept image attachments. */
export function modelSupportsImages(model: string): boolean {
  return model.toLowerCase().includes("claude");
}

/**
 * Converts a `data:image/<fmt>;base64,<bytes>` URL into a Kiro image.
 * Remote http(s) URLs are not supported by Kiro and return null.
 */
export function dataUrlToKiroImage(url: string): KiroImage | null {
  const match = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/is.exec(url.trim());
  if (!match?.[1] || !match[2]) return null;
  let format = match[1].toLowerCase();
  if (format === "jpg") format = "jpeg";
  return { format, source: { bytes: match[2] } };
}

/** Extracts images embedded in Anthropic/OpenAI-style tool_result content blocks. */
export function extractToolResultImages(content: unknown): KiroImage[] {
  if (!Array.isArray(content)) return [];
  const images: KiroImage[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "image") {
      const src = block.source as
        | { type?: string; media_type?: string; data?: string }
        | undefined;
      if (src?.type === "base64" && src.data) {
        const img = dataUrlToKiroImage(
          `data:${src.media_type || "image/jpeg"};base64,${src.data}`,
        );
        if (img) images.push(img);
      }
    } else if (block.type === "image_url") {
      const url = (block.image_url as { url?: string } | undefined)?.url;
      const img = url ? dataUrlToKiroImage(url) : null;
      if (img) images.push(img);
    }
  }
  return images;
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
