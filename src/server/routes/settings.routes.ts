import * as SettingsService from "../services/settings.service";
import type { RouteHandler } from "./types";

export const settingsRoutes: Record<string, RouteHandler> = {
  "GET /api/settings/theme": async () => {
    const theme = await SettingsService.getTheme();
    return Response.json({ theme });
  },

  "PATCH /api/settings/theme": async (req) => {
    const body = (await req.json()) as { theme?: string };
    if (!body.theme || !["light", "dark"].includes(body.theme)) {
      return Response.json({ error: "theme must be 'light' or 'dark'" }, { status: 400 });
    }
    await SettingsService.setTheme(body.theme as "light" | "dark");
    return Response.json({ ok: true });
  },

  "PATCH /api/settings/token-saver-default": async (req) => {
    const body = (await req.json()) as { enabled?: boolean };
    if (body.enabled === undefined) {
      return Response.json({ error: "enabled is required" }, { status: 400 });
    }
    await SettingsService.setTokenSaverDefault(body.enabled);
    return Response.json({ ok: true });
  },

  "GET /api/settings/api-keys": async () => {
    const keys = await SettingsService.listApiKeys();
    return Response.json(keys);
  },

  "POST /api/settings/api-keys": async (req) => {
    const body = (await req.json()) as { label?: string };
    if (!body.label) {
      return Response.json({ error: "label is required" }, { status: 400 });
    }

    try {
      const result = await SettingsService.createApiKey(body.label);
      return Response.json(result, { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },

  "DELETE /api/settings/api-keys/:id": async (_req, params) => {
    try {
      await SettingsService.revokeApiKey(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },
};
