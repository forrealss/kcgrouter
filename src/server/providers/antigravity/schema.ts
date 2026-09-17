/**
 * JSON-Schema sanitization for Antigravity (Google Cloud Code).
 *
 * Port of 9router's open-sse/translator/formats/gemini.js
 * (`cleanJSONSchemaForAntigravity`). Cloud Code validates tool parameters
 * against Gemini's proto `Schema`, which has no field for most JSON-Schema
 * keywords — a single unknown keyword rejects the whole request with
 * 400 "Unknown name ...: Cannot find field". Complex schemas are flattened
 * and unsupported keywords stripped before the payload is assembled.
 */

type Schema = Record<string, unknown>;

/** `reason` property used to fill parameter-less object schemas. */
function reasonProperty(): Schema {
  return {
    type: "string",
    description: "Brief explanation of why you are calling this tool",
  };
}

/** Default no-op schema for tools without parameters (Google rejects those). */
export function defaultParameterSchema(): Schema {
  return {
    type: "object",
    properties: { reason: reasonProperty() },
    required: ["reason"],
  };
}

/**
 * JSON-Schema keywords the Gemini schema proto has no field for. One
 * occurrence rejects the whole request with "Unknown name ...: Cannot find
 * field". Vendor extensions (`x-*`) are stripped too.
 */
const UNSUPPORTED_KEYS = new Set([
  // Basic constraints (not supported by the Gemini API)
  "minLength",
  "maxLength",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
  "format",
  "multipleOf",
  // Array keywords
  "uniqueItems",
  "contains",
  // 2020-12 keywords with no Gemini equivalent
  "unevaluatedProperties",
  "unevaluatedItems",
  "contentSchema",
  // Tuple-array keywords (converted to `items` first, leftovers stripped)
  "prefixItems",
  "additionalItems",
  // Claude rejects these in VALIDATED mode
  "default",
  "examples",
  // JSON Schema meta keywords
  "$schema",
  "$defs",
  "definitions",
  "const",
  "$ref",
  "$comment",
  // Annotation keywords (MCP tool schemas set these routinely)
  "deprecated",
  "readOnly",
  "writeOnly",
  // Object validation keywords
  "additionalProperties",
  "propertyNames",
  "patternProperties",
  "enumDescriptions",
  // Complex schema keywords (flattened by mergeAllOf/flattenAnyOfOneOf first)
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  // Dependency keywords
  "dependencies",
  "dependentSchemas",
  "dependentRequired",
  // Misc
  "title",
  "optional",
  "if",
  "then",
  "else",
  "contentMediaType",
  "contentEncoding",
  // UI/styling properties (Cursor tools — not JSON Schema standard)
  "cornerRadius",
  "fillColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "gap",
  "padding",
  "strokeColor",
  "strokeThickness",
  "textColor",
]);

function removeUnsupportedKeywords(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) removeUnsupportedKeywords(item);
    return;
  }

  const record = value as Schema;
  for (const key of Object.keys(record)) {
    if (UNSUPPORTED_KEYS.has(key) || key.startsWith("x-")) {
      delete record[key];
      continue;
    }

    const inner = record[key];
    // `properties` maps user-defined names → schemas: its keys are not schema
    // keywords, so recurse into the schema values only. (9router recurses
    // into the map itself, which would drop a property literally named e.g.
    // "format" — keeping the user's property names is strictly safer.)
    if (
      key === "properties" &&
      inner &&
      typeof inner === "object" &&
      !Array.isArray(inner)
    ) {
      for (const prop of Object.values(inner as Schema)) {
        removeUnsupportedKeywords(prop);
      }
      continue;
    }
    removeUnsupportedKeywords(inner);
  }
}

/** `const` → single-value `enum` (Gemini has no const field). */
function convertConstToEnum(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;
  if (record.const !== undefined && !record.enum) {
    record.enum = [record.const];
    delete record.const;
  }
  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") convertConstToEnum(inner);
  }
}

/** Enum values must be strings; enum requires an explicit `type: "string"`. */
function convertEnumValuesToStrings(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;
  if (Array.isArray(record.enum)) {
    record.enum = record.enum.map((v) => String(v));
    if (!record.type) record.type = "string";
  }
  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") convertEnumValuesToStrings(inner);
  }
}

/** Merge `allOf` branches (properties + required) into the parent schema. */
function mergeAllOf(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;

  if (Array.isArray(record.allOf)) {
    const merged: Schema = {};
    for (const branch of record.allOf as Schema[]) {
      if (!branch || typeof branch !== "object") continue;
      if (branch.properties) {
        merged.properties = { ...((merged.properties as Schema) ?? {}), ...(branch.properties as Schema) };
      }
      if (Array.isArray(branch.required)) {
        merged.required = [
          ...((merged.required as string[]) ?? []),
          ...(branch.required as string[]).filter(
            (req) => !((merged.required as string[]) ?? []).includes(req),
          ),
        ];
      }
    }

    delete record.allOf;
    if (merged.properties) {
      record.properties = { ...((record.properties as Schema) ?? {}), ...(merged.properties as Schema) };
    }
    if (merged.required) {
      record.required = [...((record.required as string[]) ?? []), ...(merged.required as string[])];
    }
  }

  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") mergeAllOf(inner);
  }
}

/** Pick the richest variant from anyOf/oneOf (objects > arrays > scalars). */
function selectBest(items: Schema[]): number {
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    let score = 0;
    if (item.type === "object" || item.properties) score = 3;
    else if (item.type === "array" || item.items) score = 2;
    else if (item.type && item.type !== "null") score = 1;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Flatten anyOf/oneOf to the best single variant (Gemini can't express unions). */
function flattenAnyOfOneOf(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;

  for (const key of ["anyOf", "oneOf"] as const) {
    const variants = record[key];
    if (Array.isArray(variants) && variants.length > 0) {
      const nonNull = (variants as Schema[]).filter(
        (s) => s && typeof s === "object" && s.type !== "null",
      );
      if (nonNull.length > 0) {
        const selected = nonNull[selectBest(nonNull)] ?? {};
        delete record[key];
        Object.assign(record, selected);
      }
    }
  }

  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") flattenAnyOfOneOf(inner);
  }
}

/** `type: ["string", "null"]` → first concrete type (Gemini proto-style). */
function flattenTypeArrays(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;
  if (Array.isArray(record.type)) {
    const nonNull = (record.type as unknown[]).filter((t) => t !== "null");
    record.type = nonNull.length > 0 ? nonNull[0] : "string";
  }
  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") flattenTypeArrays(inner);
  }
}

/** Infer `type: "object"` when only `properties` is present. */
function ensureObjectType(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;
  if (record.properties && !record.type) record.type = "object";
  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") ensureObjectType(inner);
  }
}

/** Gemini requires `items` on every `type: "array"` schema. */
function ensureArrayItems(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;
  if (record.type === "array" && !record.items) {
    record.items = { type: "string" };
  }
  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") ensureArrayItems(inner);
  }
}

/** prefixItems (tuple) → items — Gemini cannot express tuples. */
function convertPrefixItems(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;

  if (Array.isArray(record.prefixItems) && record.prefixItems.length > 0) {
    const variants = (record.prefixItems as Schema[]).filter(
      (s) => s && typeof s === "object" && s.type !== "null",
    );
    if (!record.items && variants.length === 1) {
      record.items = variants[0];
    } else if (!record.items && variants.length > 1) {
      record.items = { anyOf: variants };
    }
    delete record.prefixItems;
  }

  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") convertPrefixItems(inner);
  }
}

/** Drop `required` entries that no longer exist in `properties`; drop empties. */
function cleanupRequired(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;

  if (Array.isArray(record.required) && record.properties) {
    const props = record.properties as Schema;
    const valid = (record.required as string[]).filter((field) =>
      Object.hasOwn(props, field),
    );
    if (valid.length === 0) delete record.required;
    else record.required = valid;
  }

  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") cleanupRequired(inner);
  }
}

/**
 * Fill empty object schemas with a `reason` placeholder — Google rejects
 * objects with no properties.
 */
function addPlaceholders(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Schema;

  // Empty schema ({} after $ref removal) → object with a reason placeholder.
  if (Object.keys(record).length === 0) {
    record.type = "object";
    record.properties = { reason: reasonProperty() };
    record.required = ["reason"];
    return;
  }

  if (record.type === "object") {
    const props = record.properties as Schema | undefined;
    if (!props || Object.keys(props).length === 0) {
      record.properties = { reason: reasonProperty() };
      record.required = ["reason"];
    }
  }

  for (const inner of Object.values(record)) {
    if (inner && typeof inner === "object") addPlaceholders(inner);
  }
}

/**
 * Clean a tool parameter schema for the Antigravity API. Mutates the input
 * (clone at the call site) and returns it. Non-object input degrades to the
 * default `reason` schema.
 *
 * Pipeline (same phases as 9router):
 *  1. Convert: const → enum, enum values → strings
 *  2. Flatten: allOf merged, prefixItems → items, anyOf/oneOf → best variant,
 *     type arrays → concrete type
 *  2.5 Infer: type "object" from properties, items for arrays
 *  3. Strip unsupported keywords (all levels) and x-* vendor extensions
 *  4. Cleanup required lists
 *  5. Fill empty object schemas with a reason placeholder
 */
export function cleanJSONSchemaForAntigravity(schema: unknown): Schema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return defaultParameterSchema();
  }
  const cleaned = schema as Schema;

  convertConstToEnum(cleaned);
  convertEnumValuesToStrings(cleaned);

  mergeAllOf(cleaned);
  convertPrefixItems(cleaned);
  flattenAnyOfOneOf(cleaned);
  flattenTypeArrays(cleaned);

  ensureObjectType(cleaned);
  ensureArrayItems(cleaned);

  removeUnsupportedKeywords(cleaned);

  cleanupRequired(cleaned);
  addPlaceholders(cleaned);

  return cleaned;
}
