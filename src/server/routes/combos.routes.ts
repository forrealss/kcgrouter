import * as ComboEngine from "../services/combo-engine.service";
import type { RouteHandler } from "./types";

export const combosRoutes: Record<string, RouteHandler> = {
  "GET /api/combos": () => {
    const combos = ComboEngine.listCombos();
    return Response.json(combos);
  },

  "POST /api/combos": async (req) => {
    const body = (await req.json()) as { name?: string; strategy?: string };
    if (!body.name || !body.strategy) {
      return Response.json({ error: "name and strategy are required" }, { status: 400 });
    }

    try {
      const combo = ComboEngine.createCombo(body.name, body.strategy as "fallback" | "round_robin");
      return Response.json(combo, { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },

  "DELETE /api/combos/:id": (_req, params) => {
    try {
      ComboEngine.deleteCombo(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 404 });
    }
  },

  "GET /api/combos/:id/members": (_req, params) => {
    const members = ComboEngine.getMembersSortedByPriority(params?.id ?? "");
    return Response.json(members);
  },

  "POST /api/combos/:id/members": async (req, params) => {
    const body = (await req.json()) as { providerAccountId?: string; modelName?: string; priority?: number; inputCostPer1M?: number; outputCostPer1M?: number };
    if (!body.providerAccountId || !body.modelName || body.priority === undefined) {
      return Response.json({ error: "providerAccountId, modelName, and priority are required" }, { status: 400 });
    }

    try {
      const member = ComboEngine.addMember(params?.id ?? "", {
        providerAccountId: body.providerAccountId,
        modelName: body.modelName,
        priority: body.priority,
        inputCostPer1M: body.inputCostPer1M,
        outputCostPer1M: body.outputCostPer1M,
      });
      return Response.json(member, { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },

  "PATCH /api/combos/:id/members/reorder": async (req, params) => {
    const body = (await req.json()) as { orderedMemberIds?: string[] };
    if (!body.orderedMemberIds) {
      return Response.json({ error: "orderedMemberIds is required" }, { status: 400 });
    }

    try {
      ComboEngine.reorderMembers(params?.id ?? "", body.orderedMemberIds);
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  },
};
