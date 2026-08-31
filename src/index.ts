import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "bun";
import { getServerPort } from "./config";
import { runMigrations } from "./db/migrations";
import { ensureSecrets } from "./env";
import { setProcessName } from "./lib/process-name";
import { authenticateApiKey } from "./server/middleware/api-key-auth.middleware";
import { enforcePasswordChange } from "./server/middleware/password-change-gate.middleware";
import { authenticateSession } from "./server/middleware/session-auth.middleware";
import { authRoutes } from "./server/routes/auth.routes";
import { cliToolsRoutes } from "./server/routes/cli-tools.routes";
import { combosRoutes } from "./server/routes/combos.routes";
import { dashboardRoutes } from "./server/routes/dashboard.routes";
import { eventsRoutes } from "./server/routes/events.routes";
import { logsRoutes } from "./server/routes/logs.routes";
import { matchRoute as resolveRoute } from "./server/routes/match-route";
import { providersRoutes } from "./server/routes/providers.routes";
import { quotaRoutes } from "./server/routes/quota.routes";
import { settingsRoutes } from "./server/routes/settings.routes";
import type { RouteHandler } from "./server/routes/types";
import { usageRoutes } from "./server/routes/usage.routes";
import { v1Routes } from "./server/routes/v1.routes";
import { checkEncryptionHealth } from "./server/services/encryption-health.service";

// Show up as "kcgrouter" (not "bun") in process managers.
setProcessName("kcgrouter");

const MIME_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getMimeType(pathname: string): string | null {
  const ext = pathname.slice(pathname.lastIndexOf("."));
  return MIME_TYPES[ext] ?? null;
}

// Production installs serve the prebuilt frontend from dist/ (produced by
// `bun run build` at publish time). Bundling src/ at runtime from a globally
// installed package can resolve `react` to two different copies — the
// package's own node_modules and a hoisted copy in the shared global
// node_modules — which duplicates React and crashes hooks with
// "Cannot read properties of null (reading 'useContext')".
const DIST_DIR = join(import.meta.dir, "../dist");
const DIST_INDEX_PATH = join(DIST_DIR, "index.html");
const serveDist =
  process.env.NODE_ENV === "production" && existsSync(DIST_INDEX_PATH);

async function buildDistIndex(): Promise<Response> {
  const html = await Bun.file(DIST_INDEX_PATH).text();
  // Rewrite any `src`/`href` pointing at ./assets relative to the page
  // (breaks on nested SPA routes like /providers/:id) to root-relative.
  return new Response(html.replace(/(src|href)="\.\//g, '$1="/'), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Lazy-load the source HTML bundle only when dist/ is not being served, so
// production installs never bundle src/ (with its skewed dependency tree).
const index = serveDist
  ? await buildDistIndex()
  : (await import("./index.html")).default;

/** Serve a hashed asset from dist/ (JS/CSS chunks, favicon, sourcemaps). */
async function serveDistAsset(req: Request): Promise<Response> {
  if (!serveDist) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const filePath = join(DIST_DIR, url.pathname.replace(/^\/+/, ""));
  const file = Bun.file(filePath);
  if (await file.exists()) {
    const mime = getMimeType(url.pathname) ?? "application/octet-stream";
    return new Response(file, { headers: { "Content-Type": mime } });
  }
  return new Response("Not found", { status: 404 });
}

// Bootstrap secrets before anything touches the database/crypto
ensureSecrets();

// Run migrations on startup
runMigrations();

// Detect a persisted ENCRYPTION_KEY mismatch (e.g. dev vs production) early,
// so the failure mode is a clear startup warning instead of cryptic 500s.
try {
  const health = checkEncryptionHealth();
  if (health.mismatch) {
    console.warn(
      `[encryption] ENCRYPTION_KEY mismatch: ${health.undecryptable}/${health.checked} stored credential(s) cannot be decrypted with the current key. Accounts/API keys created under a different key will fail to work.`,
    );
  }
} catch {
  // DB not ready yet — the mismatch will surface on the first probe.
}

// All API routes (session-auth protected)
const apiRoutes: Record<string, RouteHandler> = {
  ...authRoutes,
  ...cliToolsRoutes,
  ...providersRoutes,
  ...combosRoutes,
  ...dashboardRoutes,
  ...logsRoutes,
  ...usageRoutes,
  ...quotaRoutes,
  ...settingsRoutes,
  ...eventsRoutes,
};

// V1 routes (API key auth protected)
const v1Handlers: Record<string, RouteHandler> = {
  ...v1Routes,
};

function matchRoute(method: string, pathname: string) {
  return resolveRoute(method, pathname, [apiRoutes, v1Handlers]);
}

const server = serve({
  port: getServerPort(),
  idleTimeout: 0,
  routes: {
    "/v1/*": async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const method = req.method;

      // V1 routes — API key auth
      const auth = await authenticateApiKey(req);
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

      // Public API routes: login, and reading the theme (the login page needs
      // the saved theme before a session exists). Everything else needs auth.
      const isPublic =
        pathname === "/api/auth/login" ||
        (pathname === "/api/settings/theme" && method === "GET");
      if (!isPublic) {
        const auth = authenticateSession(req);
        if (!auth.ok) return auth.response;

        // While the dashboard still uses the seeded default password, refuse
        // every authenticated route except the ones needed to see that state
        // and fix it.
        const gate = await enforcePasswordChange(method, pathname);
        if (!gate.ok) return gate.response;
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
    "/images/*": async (req) => {
      const url = new URL(req.url);
      const filePath = join(import.meta.dir, "../public", url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const mime = getMimeType(url.pathname);
        return new Response(file, {
          headers: mime ? { "Content-Type": mime } : {},
        });
      }
      return new Response("Not found", { status: 404 });
    },
    "/fonts/*": async (req) => {
      const url = new URL(req.url);
      const filePath = join(import.meta.dir, "../public", url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const mime = getMimeType(url.pathname);
        return new Response(file, {
          headers: mime ? { "Content-Type": mime } : {},
        });
      }
      return new Response("Not found", { status: 404 });
    },

    // Prebuilt frontend assets (dist/) — hashed chunks, favicon, sourcemaps.
    // Registered only in production so /_bun/* dev assets stay uncaught
    // (`false` disables the route in dev, keeping /_bun/* assets free).
    "/*": serveDist ? serveDistAsset : false,

    // SPA routes — list explicitly to avoid /* catching /_bun/* dev assets
    "/": index,
    "/login": index,
    "/providers": index,
    "/providers/*": index,
    "/combos": index,
    "/combos/*": index,
    "/usage": index,
    "/logs": index,
    "/quota": index,
    "/token-saver": index,
    "/cli-tools": index,
    "/cli-tools/*": index,
    "/dashboard": index,
    "/settings": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: false,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
