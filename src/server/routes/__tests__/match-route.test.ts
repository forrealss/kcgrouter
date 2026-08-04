import { describe, expect, test } from "bun:test";
import type { MatchedRoute } from "../match-route";
import { decodeParam, matchRoute } from "../match-route";
import type { RouteHandler } from "../types";

const ok: RouteHandler = () => new Response("ok");
const other: RouteHandler = () => new Response("other");

/** Asserts a route matched, so assertions can read params without `!`. */
function expectMatch(matched: MatchedRoute | null): MatchedRoute {
  if (!matched) throw new Error("expected the route to match");
  return matched;
}

describe("decodeParam", () => {
  test("decodes percent-encoded slashes", () => {
    expect(decodeParam("deepseek%2Fdeepseek-v4-pro")).toBe(
      "deepseek/deepseek-v4-pro",
    );
  });

  test("leaves plain values untouched", () => {
    expect(decodeParam("glm-5")).toBe("glm-5");
  });

  test("falls back to the raw value on malformed sequences", () => {
    expect(decodeParam("%")).toBe("%");
    expect(decodeParam("%zz")).toBe("%zz");
  });
});

describe("matchRoute", () => {
  const api: Record<string, RouteHandler> = {
    "POST /api/providers/models/:modelId/test": ok,
    "GET /api/providers/:id/accounts": ok,
    "POST /api/auth/login": other,
  };
  const v1: Record<string, RouteHandler> = {
    "POST /v1/chat/completions": other,
    "GET /v1/models/:modelId": ok,
  };
  const tables = [api, v1];

  test("decodes a slashed model ID into the param", () => {
    const m = expectMatch(
      matchRoute(
        "POST",
        "/api/providers/models/deepseek%2Fdeepseek-v4-pro/test",
        tables,
      ),
    );
    // Before the fix this stayed "deepseek%2Fdeepseek-v4-pro" and was sent
    // upstream verbatim as the model name.
    expect(m.params.modelId).toBe("deepseek/deepseek-v4-pro");
  });

  test("handles model IDs without slashes", () => {
    const m = expectMatch(
      matchRoute("POST", "/api/providers/models/glm-5/test", tables),
    );
    expect(m.params.modelId).toBe("glm-5");
  });

  test("decodes params on v1 routes too", () => {
    const m = expectMatch(
      matchRoute("GET", "/v1/models/deepseek%2Fdeepseek-v4-pro", tables),
    );
    expect(m.params.modelId).toBe("deepseek/deepseek-v4-pro");
  });

  test("prefers exact matches over patterns", () => {
    const m = expectMatch(matchRoute("POST", "/api/auth/login", tables));
    expect(m.handler).toBe(other);
    expect(m.params).toEqual({});
  });

  test("respects the HTTP method", () => {
    expect(
      matchRoute("DELETE", "/api/providers/models/glm-5/test", tables),
    ).toBeNull();
  });

  test("returns null for unknown paths", () => {
    expect(matchRoute("GET", "/api/nope", tables)).toBeNull();
  });

  test("does not match when segment counts differ", () => {
    expect(
      matchRoute("POST", "/api/providers/models/glm-5", tables),
    ).toBeNull();
  });

  test("extracts multiple distinct params", () => {
    const m = expectMatch(
      matchRoute("GET", "/api/providers/prov_123/accounts", tables),
    );
    expect(m.params.id).toBe("prov_123");
  });
});
