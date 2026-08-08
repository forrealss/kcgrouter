import * as ComboEngine from "../services/combo-engine.service";
import * as RequestLog from "../services/request-log.service";
import type { RouteHandler } from "./types";

export const combosRoutes: Record<string, RouteHandler> = {
  "GET /api/combos": () => {
    const combos = ComboEngine.listCombos();
    return Response.json(combos);
  },

  "POST /api/combos": async (req) => {
    const body = (await req.json()) as { name?: string; strategy?: string };
    if (!body.name || !body.strategy) {
      return Response.json(
        { error: "name and strategy are required" },
        { status: 400 },
      );
    }

    try {
      const combo = ComboEngine.createCombo(
        body.name,
        body.strategy as "fallback" | "round_robin",
      );
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: combo.id,
        model: null,
        sourceFormat: null,
        stream: false,
        message: `Combo "${combo.name}" created`,
        latencyMs: null,
      });
      return Response.json(combo, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "DELETE /api/combos/:id": (_req, params) => {
    const comboId = params?.id ?? "";
    const existing = ComboEngine.getCombo(comboId);
    try {
      ComboEngine.deleteCombo(comboId);
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: existing
          ? `Combo "${existing.name}" deleted`
          : `Combo with ID "${comboId}" deleted`,
        latencyMs: null,
      });
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 404 },
      );
    }
  },

  "GET /api/combos/:id/members": (_req, params) => {
    const members = ComboEngine.getMembersSortedByPriority(params?.id ?? "");
    return Response.json(members);
  },

  "POST /api/combos/:id/members": async (req, params) => {
    const body = (await req.json()) as {
      providerAccountId?: string;
      modelName?: string;
      priority?: number;
      inputCostPer1M?: number;
      outputCostPer1M?: number;
    };
    if (
      !body.providerAccountId ||
      !body.modelName ||
      body.priority === undefined
    ) {
      return Response.json(
        { error: "providerAccountId, modelName, and priority are required" },
        { status: 400 },
      );
    }

    try {
      const combo = ComboEngine.getCombo(params?.id ?? "");
      const member = ComboEngine.addMember(params?.id ?? "", {
        providerAccountId: body.providerAccountId,
        modelName: body.modelName,
        priority: body.priority,
        inputCostPer1M: body.inputCostPer1M,
        outputCostPer1M: body.outputCostPer1M,
      });
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: member.providerAccountId,
        comboId: combo?.id ?? member.comboId,
        model: member.modelName,
        sourceFormat: null,
        stream: false,
        message: `Member "${member.modelName}" added to combo "${combo?.name ?? member.comboId}"`,
        latencyMs: null,
      });
      return Response.json(member, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "PATCH /api/combos/:id/members/reorder": async (req, params) => {
    const body = (await req.json()) as { orderedMemberIds?: string[] };
    if (!body.orderedMemberIds) {
      return Response.json(
        { error: "orderedMemberIds is required" },
        { status: 400 },
      );
    }

    try {
      const combo = ComboEngine.getCombo(params?.id ?? "");
      ComboEngine.reorderMembers(params?.id ?? "", body.orderedMemberIds);
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: params?.id ?? null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: combo
          ? `Member order of combo "${combo.name}" changed`
          : `Combo members reordered`,
        latencyMs: null,
      });
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },
};
