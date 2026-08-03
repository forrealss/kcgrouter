import * as ProviderRegistry from "../services/provider-registry.service";
import type { RouteHandler } from "./types";

export const providersRoutes: Record<string, RouteHandler> = {
  "GET /api/providers": () => {
    const providers = ProviderRegistry.listProviders();
    return Response.json(providers);
  },

  "POST /api/providers": async (req) => {
    const body = (await req.json()) as { name?: string; transport?: string; baseUrl?: string };
    if (!body.name || !body.transport || !body.baseUrl) {
      return Response.json({ error: "name, transport, and baseUrl are required" }, { status: 400 });
    }

    try {
      const provider = ProviderRegistry.createProvider({
        name: body.name,
        transport: body.transport as "openai" | "anthropic" | "gemini",
        baseUrl: body.baseUrl,
      });
      return Response.json(provider, { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },

  "DELETE /api/providers/:id": (_req, params) => {
    try {
      ProviderRegistry.deleteProvider(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 404 });
    }
  },

  "GET /api/providers/:id/accounts": (_req, params) => {
    const accounts = ProviderRegistry.listAccounts(params?.id ?? "");
    return Response.json(accounts);
  },

  "POST /api/providers/:id/accounts": async (req, params) => {
    const body = (await req.json()) as { label?: string; apiKey?: string; quotaResetType?: string; quotaLimitTokens?: number | null };
    if (!body.label || !body.apiKey) {
      return Response.json({ error: "label and apiKey are required" }, { status: 400 });
    }

    try {
      const account = ProviderRegistry.addAccount(params?.id ?? "", {
        label: body.label,
        apiKey: body.apiKey,
        quotaResetType: body.quotaResetType as "5h" | "daily" | "weekly" | "none",
        quotaLimitTokens: body.quotaLimitTokens,
      });
      return Response.json(account, { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },

  "PATCH /api/providers/accounts/:id": async (req, params) => {
    const body = (await req.json()) as { label?: string; apiKey?: string; quotaResetType?: string; quotaLimitTokens?: number | null };
    try {
      const account = ProviderRegistry.updateAccount(params?.id ?? "", {
        label: body.label,
        apiKey: body.apiKey,
        quotaResetType: body.quotaResetType as "5h" | "daily" | "weekly" | "none",
        quotaLimitTokens: body.quotaLimitTokens,
      });
      return Response.json(account);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },

  "DELETE /api/providers/accounts/:id": (_req, params) => {
    try {
      ProviderRegistry.removeAccount(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 404 });
    }
  },
};
