import * as ProviderRegistry from "../services/provider-registry.service";
import * as RequestLog from "../services/request-log.service";
import type { RouteHandler } from "./types";

export const dashboardRoutes: Record<string, RouteHandler> = {
  "GET /api/dashboard/stats": () => {
    const retry = RequestLog.getRetryStats();
    return Response.json({
      ...retry,
      // Accounts currently inside their auto-recovery cooldown window.
      coolingDown: ProviderRegistry.countCoolingDownAccounts(),
    });
  },
};
