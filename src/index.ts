import { serve } from "bun";
import { runMigrations } from "./db/migrations";
import index from "./index.html";
import { authenticateApiKey } from "./server/middleware/api-key-auth.middleware";
import { authenticateSession } from "./server/middleware/session-auth.middleware";
import { authRoutes } from "./server/routes/auth.routes";
import { combosRoutes } from "./server/routes/combos.routes";
import { matchRoute as resolveRoute } from "./server/routes/match-route";
import { providersRoutes } from "./server/routes/providers.routes";
import { quotaRoutes } from "./server/routes/quota.routes";
import { settingsRoutes } from "./server/routes/settings.routes";
import type { RouteHandler } from "./server/routes/types";
import { usageRoutes } from "./server/routes/usage.routes";
import { v1Routes } from "./server/routes/v1.routes";

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

function matchRoute(method: string, pathname: string) {
  return resolveRoute(method, pathname, [apiRoutes, v1Handlers]);
}

const server = serve({
  port: Number(process.env.PORT) || 3000,
  idleTimeout: 0,
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
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
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
