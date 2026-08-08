import * as ProviderRegistry from "../services/provider-registry.service";
import * as ProviderUsage from "../services/provider-usage.service";
import * as QuotaTracker from "../services/quota-tracker.service";
import type { RouteHandler } from "./types";

export const quotaRoutes: Record<string, RouteHandler> = {
  "GET /api/quota": () => {
    const providers = ProviderRegistry.listProviders();
    const result: unknown[] = [];

    for (const provider of providers) {
      // Only show connections from providers that have a usage tracker
      // (currently Kiro and Command Code).
      if (!ProviderUsage.isTrackedTransport(provider.transport)) continue;

      const accounts = ProviderRegistry.listAccounts(provider.id);
      for (const account of accounts) {
        try {
          const state = QuotaTracker.getState(account.id);
          const available = QuotaTracker.isAvailable(account.id);
          result.push({
            ...account,
            providerName: provider.name,
            transport: provider.transport,
            quotaState: state,
            available,
          });
        } catch {
          // skip accounts without quota state
        }
      }
    }

    return Response.json(result);
  },

  "GET /api/quota/usage": async () => {
    try {
      const usage = await ProviderUsage.getAllProviderUsage();
      return Response.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message }, { status: 500 });
    }
  },

  "GET /api/quota/usage/:accountId": async (req) => {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const accountId = pathParts[pathParts.length - 1];

    if (!accountId) {
      return Response.json({ error: "Account ID required" }, { status: 400 });
    }

    try {
      const usage = await ProviderUsage.getProviderUsage(accountId);
      if (!usage) {
        return Response.json(
          { error: "No usage data available" },
          { status: 404 },
        );
      }
      return Response.json(usage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message }, { status: 500 });
    }
  },
};
