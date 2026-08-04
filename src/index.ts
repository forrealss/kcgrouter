import { serve } from "bun";
import index from "./index.html";
import { runMigrations } from "./db/migrations";
import { authenticateApiKey } from "./server/middleware/api-key-auth.middleware";
import { authenticateSession } from "./server/middleware/session-auth.middleware";
import { authRoutes } from "./server/routes/auth.routes";
import { providersRoutes } from "./server/routes/providers.routes";
import { combosRoutes } from "./server/routes/combos.routes";
import { usageRoutes } from "./server/routes/usage.routes";
import { quotaRoutes } from "./server/routes/quota.routes";
import { settingsRoutes } from "./server/routes/settings.routes";
import { v1Routes } from "./server/routes/v1.routes";
import type { RouteHandler } from "./server/routes/types";

// Run migrations on startup
runMigrations();

// All API routes (session-auth protected)
const apiRoutes: Record<string, RouteHandler> = {
  ...authRoutes,
  ...providersRoutes,
  ...combosRoutes,
  ...usageRoutes,
  ...quotaRoutes,
  ...settingsRoutes,
};

// V1 routes (API key auth protected)
const v1Handlers: Record<string, RouteHandler> = {
  ...v1Routes,
};

function matchRoute(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
  // Try exact match first
  const exactKey = `${method} ${pathname}`;
  if (apiRoutes[exactKey]) return { handler: apiRoutes[exactKey], params: {} };
  if (v1Handlers[exactKey]) return { handler: v1Handlers[exactKey], params: {} };

  // Try pattern match (e.g. /api/providers/:id/accounts)
  for (const [pattern, handler] of Object.entries(apiRoutes)) {
    const [pMethod, pPath] = pattern.split(" ");
    if (pMethod !== method) continue;

    const patternParts = pPath.split("/");
    const pathParts = pathname.split("/");
    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      const vp = pathParts[i];
      if (pp?.startsWith(":")) {
        params[pp.slice(1)] = vp ?? "";
      } else if (pp !== vp) {
        match = false;
        break;
      }
    }
    if (match) return { handler, params };
  }

  for (const [pattern, handler] of Object.entries(v1Handlers)) {
    const [pMethod, pPath] = pattern.split(" ");
    if (pMethod !== method) continue;

    const patternParts = pPath.split("/");
    const pathParts = pathname.split("/");
    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      const vp = pathParts[i];
      if (pp?.startsWith(":")) {
        params[pp.slice(1)] = vp ?? "";
      } else if (pp !== vp) {
        match = false;
        break;
      }
    }
    if (match) return { handler, params };
  }

  return null;
}

const server = serve({
  port: Number(process.env.PORT) || 3000,
  routes: {
    "/v1/*": async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const method = req.method;

      // V1 routes — API key auth
      const auth = authenticateApiKey(req);
      if (!auth.ok) return auth.response;

      const matched = matchRoute(method, pathname);
      if (matched) {
        return matched.handler(req, matched.params);
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    },

    "/api/*": async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const method = req.method;

      // API routes — session auth (except login)
      if (pathname !== "/api/auth/login") {
        const auth = authenticateSession(req);
        if (!auth.ok) return auth.response;
      }

      const matched = matchRoute(method, pathname);
      if (matched) {
        return matched.handler(req, matched.params);
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    },

    // Static assets / SPA fallback
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
