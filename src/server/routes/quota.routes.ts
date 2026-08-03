import * as QuotaTracker from "../services/quota-tracker.service";
import * as ProviderRegistry from "../services/provider-registry.service";
import type { RouteHandler } from "./types";

export const quotaRoutes: Record<string, RouteHandler> = {
  "GET /api/quota": () => {
    const providers = ProviderRegistry.listProviders();
    const result: unknown[] = [];

    for (const provider of providers) {
      const accounts = ProviderRegistry.listAccounts(provider.id);
      for (const account of accounts) {
        try {
          const state = QuotaTracker.getState(account.id);
          const available = QuotaTracker.isAvailable(account.id);
          result.push({
            ...account,
            providerName: provider.name,
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
};
