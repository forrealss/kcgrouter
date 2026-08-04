import type { RouteHandler } from "./types";

export interface MatchedRoute {
  handler: RouteHandler;
  params: Record<string, string>;
}

// Route params arrive percent-encoded (model IDs like "deepseek/deepseek-v4-pro"
// are sent as "deepseek%2Fdeepseek-v4-pro"), so they must be decoded before use.
// Malformed sequences fall back to the raw value instead of throwing.
export function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchPattern(
  pattern: string,
  method: string,
  pathParts: string[],
): Record<string, string> | null {
  const [pMethod, pPath] = pattern.split(" ");
  if (pMethod !== method || !pPath) return null;

  const patternParts = pPath.split("/");
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const vp = pathParts[i];
    if (pp?.startsWith(":")) {
      params[pp.slice(1)] = decodeParam(vp ?? "");
    } else if (pp !== vp) {
      return null;
    }
  }
  return params;
}

/**
 * Resolves a request to a handler. Exact matches win over pattern matches, and
 * earlier tables win over later ones. Tables are passed in so this stays pure
 * and testable without pulling in the route modules (and their DB imports).
 */
export function matchRoute(
  method: string,
  pathname: string,
  tables: Record<string, RouteHandler>[],
): MatchedRoute | null {
  const exactKey = `${method} ${pathname}`;
  for (const table of tables) {
    const handler = table[exactKey];
    if (handler) return { handler, params: {} };
  }

  const pathParts = pathname.split("/");
  for (const table of tables) {
    for (const [pattern, handler] of Object.entries(table)) {
      const params = matchPattern(pattern, method, pathParts);
      if (params) return { handler, params };
    }
  }

  return null;
}
