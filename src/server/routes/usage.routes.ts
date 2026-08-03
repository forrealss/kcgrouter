import * as UsageRecorder from "../services/usage-recorder.service";
import type { RouteHandler } from "./types";

export const usageRoutes: Record<string, RouteHandler> = {
  "GET /api/usage/summary": (req) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    const range = from && to ? { from, to } : undefined;
    const summary = UsageRecorder.summarize(range);
    return Response.json(summary);
  },

  "GET /api/usage/history": (req) => {
    const url = new URL(req.url);
    const providerAccountId = url.searchParams.get("providerAccountId") ?? undefined;
    const model = url.searchParams.get("model") ?? undefined;
    const fromDate = url.searchParams.get("from") ?? undefined;
    const toDate = url.searchParams.get("to") ?? undefined;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50;

    const history = UsageRecorder.getHistory({
      providerAccountId,
      model,
      fromDate,
      toDate,
      limit,
    });
    return Response.json(history);
  },
};
