import * as RequestLog from "../services/request-log.service";
import type { RouteHandler } from "./types";

export const logsRoutes: Record<string, RouteHandler> = {
  "GET /api/logs/:id/payloads": (_req, params) => {
    const logId = params?.id;
    if (!logId) {
      return Response.json({ error: "Log ID is required" }, { status: 400 });
    }

    // A log with no stored payload is a normal outcome (admin entries, or logs
    // from before payload capture), not a failure. Returning 404 made the client
    // render a scary error for the expected case, so report empty bodies and let
    // the UI say "nothing captured".
    const payloads = RequestLog.getPayloads(logId);
    return Response.json(payloads ?? { requestBody: null, responseBody: null });
  },

  "GET /api/logs": (req) => {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? undefined;
    const source = url.searchParams.get("source") ?? undefined;
    const providerAccountId =
      url.searchParams.get("providerAccountId") ?? undefined;
    const providerId = url.searchParams.get("providerId") ?? undefined;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 50;

    const history = RequestLog.getHistory({
      type: type as "request" | "success" | "error" | "admin" | undefined,
      source: source as "router" | "test" | "admin" | undefined,
      providerAccountId,
      providerId,
      from,
      to,
      limit,
    });
    return Response.json(history);
  },

  "DELETE /api/logs": () => {
    RequestLog.clearAll();
    return Response.json({ ok: true });
  },
};
