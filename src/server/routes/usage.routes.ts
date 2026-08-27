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
    const providerAccountId =
      url.searchParams.get("providerAccountId") ?? undefined;
    const model = url.searchParams.get("model") ?? undefined;
    const fromDate = url.searchParams.get("from") ?? undefined;
    const toDate = url.searchParams.get("to") ?? undefined;

    // Clamp rather than trust: an unbounded or non-numeric limit would either
    // return the whole table or produce `LIMIT NaN`. Note `Number(null)` is 0,
    // so the presence of the param has to be checked before parsing it.
    const limitParam = url.searchParams.get("limit")?.trim();
    const parsedLimit = limitParam ? Number(limitParam) : Number.NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 500)
      : 50;

    const rawSort = url.searchParams.get("sort");
    if (rawSort && !UsageRecorder.isHistorySort(rawSort)) {
      return Response.json(
        {
          error: `Invalid sort. Must be one of: ${UsageRecorder.HISTORY_SORT_KEYS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const history = UsageRecorder.getHistory({
      providerAccountId,
      model,
      fromDate,
      toDate,
      limit,
      sort: rawSort ?? undefined,
    });
    return Response.json(history);
  },
};
