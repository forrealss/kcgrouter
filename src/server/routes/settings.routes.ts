import * as EncryptionHealth from "../services/encryption-health.service";
import * as SettingsService from "../services/settings.service";
import { getSupportedFilters } from "../services/token-saver.service";
import { getVersionInfo } from "../services/version.service";
import type { RouteHandler } from "./types";

export const settingsRoutes: Record<string, RouteHandler> = {
  "GET /api/settings/version": async () => {
    const info = await getVersionInfo();
    return Response.json({
      current: info.current,
      latest: info.latest,
      updateAvailable: info.updateAvailable,
      checkFailed: info.checkFailed,
      packageManager: info.packageManager,
      updateCommand: info.updateCommand,
    });
  },

  "GET /api/settings/theme": async () => {
    const theme = await SettingsService.getTheme();
    return Response.json({ theme });
  },

  "GET /api/settings/encryption-health": () => {
    try {
      return Response.json(EncryptionHealth.checkEncryptionHealth());
    } catch (err) {
      // A diagnostics endpoint should never 500 — degrade to a neutral report.
      const message =
        err instanceof Error ? err.message : "Health check failed";
      return Response.json(
        {
          mismatch: false,
          checked: 0,
          undecryptable: 0,
          accounts: { checked: 0, undecryptable: 0 },
          apiKeys: { checked: 0, undecryptable: 0 },
          error: message,
        },
        { status: 500 },
      );
    }
  },

  "PATCH /api/settings/theme": async (req) => {
    const body = (await req.json()) as { theme?: string };
    if (!body.theme || !["light", "dark", "system"].includes(body.theme)) {
      return Response.json(
        { error: "theme must be 'light', 'dark', or 'system'" },
        { status: 400 },
      );
    }
    await SettingsService.setTheme(body.theme as "light" | "dark" | "system");
    return Response.json({ ok: true });
  },

  "GET /api/settings/token-saver": () => {
    const stats = SettingsService.getTokenSaverStats();
    const caveman = SettingsService.getCavemanSettings();
    const ponytail = SettingsService.getPonytailSettings();
    return Response.json({
      enabled: SettingsService.getTokenSaverDefault(),
      filters: getSupportedFilters().map((name) => ({ name, active: true })),
      cavemanEnabled: caveman.enabled,
      cavemanLevel: caveman.level,
      ponytailEnabled: ponytail.enabled,
      ponytailLevel: ponytail.level,
      ...stats,
    });
  },

  "PATCH /api/settings/token-saver-default": async (req) => {
    const body = (await req.json()) as { enabled?: boolean };
    if (body.enabled === undefined) {
      return Response.json({ error: "enabled is required" }, { status: 400 });
    }
    await SettingsService.setTokenSaverDefault(body.enabled);
    return Response.json({ ok: true });
  },

  "PATCH /api/settings/caveman": async (req) => {
    const body = (await req.json()) as {
      enabled?: boolean;
      level?: string;
    };
    if (body.enabled !== undefined) {
      await SettingsService.setCavemanEnabled(body.enabled);
    }
    if (body.level !== undefined) {
      await SettingsService.setCavemanLevel(body.level);
    }
    return Response.json({ ok: true });
  },

  "PATCH /api/settings/ponytail": async (req) => {
    const body = (await req.json()) as {
      enabled?: boolean;
      level?: string;
    };
    if (body.enabled !== undefined) {
      await SettingsService.setPonytailEnabled(body.enabled);
    }
    if (body.level !== undefined) {
      await SettingsService.setPonytailLevel(body.level);
    }
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
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "GET /api/settings/api-keys/:id/key": async (_req, params) => {
    try {
      const key = SettingsService.getDecryptedApiKey(params?.id ?? "");
      return Response.json({ key });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "DELETE /api/settings/api-keys/:id": async (_req, params) => {
    try {
      await SettingsService.revokeApiKey(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },
};
