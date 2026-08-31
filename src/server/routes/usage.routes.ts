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

    // Assign inside the guard so the type predicate actually narrows: testing
    // `rawSort && !isHistorySort(rawSort)` and then passing `rawSort` along
    // leaves it as a plain string as far as the compiler is concerned.
    const rawSort = url.searchParams.get("sort");
    let sort: UsageRecorder.HistorySort | undefined;
    if (rawSort !== null) {
      if (!UsageRecorder.isHistorySort(rawSort)) {
        return Response.json(
          {
            error: `Invalid sort. Must be one of: ${UsageRecorder.HISTORY_SORT_KEYS.join(", ")}`,
          },
          { status: 400 },
        );
      }
      sort = rawSort;
    }

    const history = UsageRecorder.getHistory({
      providerAccountId,
      model,
      fromDate,
      toDate,
      limit,
      sort,
    });
    return Response.json(history);
  },

  "GET /api/usage/timeseries": (req) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return Response.json(
        { error: "from and to are required" },
        { status: 400 },
      );
    }

    const rawBucket = url.searchParams.get("bucket") ?? "day";
    if (!UsageRecorder.isBucketGranularity(rawBucket)) {
      return Response.json(
        { error: "Invalid bucket. Must be one of: day, hour" },
        { status: 400 },
      );
    }

    const rawOffset = url.searchParams.get("tzOffsetMinutes");
    const parsedOffset = rawOffset ? Number(rawOffset) : 0;
    const tzOffsetMinutes = Number.isFinite(parsedOffset) ? parsedOffset : 0;

    const buckets = UsageRecorder.timeseries({
      from,
      to,
      granularity: rawBucket,
      tzOffsetMinutes,
    });
    return Response.json(buckets);
  },

  // Payloads live in MB-sized TEXT columns, so they are fetched per record on
  // demand instead of riding along with every history page.
  "GET /api/usage/history/:id/payloads": (_req, params) => {
    const id = params?.id;
    if (!id) {
      return Response.json({ error: "Record ID is required" }, { status: 400 });
    }

    // A record with no stored payload is a normal outcome (realtime rows,
    // or entries from before payload capture), not a failure — report empty
    // bodies and let the UI say "nothing captured".
    const payloads = UsageRecorder.getPayloads(id);
    return Response.json(payloads ?? { requestBody: null, responseBody: null });
  },

  "DELETE /api/usage/history": () => {
    UsageRecorder.clearAll();
    return Response.json({ ok: true });
  },
};
