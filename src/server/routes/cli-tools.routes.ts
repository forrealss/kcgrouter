/**
 * Generic CLI tools routes — delegates to per-tool handlers via the registry.
 *
 * GET    /api/cli-tools                 — list all tools with status
 * GET    /api/cli-tools/:id             — read tool status + details
 * POST   /api/cli-tools/:id             — apply/merge provider config
 * PATCH  /api/cli-tools/:id             — partial update (e.g. clearActiveModel)
 * DELETE /api/cli-tools/:id             — remove provider config
 */

import { getAllToolStatuses, getTool } from "../cli-tools";
import type { RouteHandler } from "./types";

// GET /api/cli-tools — list all tools
const handleList: RouteHandler = () => {
  return Response.json(getAllToolStatuses());
};

// GET /api/cli-tools/:id — read one tool
const handleGet: RouteHandler = (_req, params) => {
  const tool = getTool(params?.id ?? "");
  if (!tool) {
    return Response.json({ error: "Tool not found" }, { status: 404 });
  }
  const status = tool.read();
  return Response.json({ ...status, configPath: tool.getConfigPath() });
};

// POST /api/cli-tools/:id — apply config
const handlePost: RouteHandler = async (req, params) => {
  const tool = getTool(params?.id ?? "");
  if (!tool) {
    return Response.json({ error: "Tool not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    baseUrl?: string;
    apiKey?: string;
    models?: string[];
    activeModel?: string;
    subagentModel?: string;
  };

  if (!body.baseUrl) {
    return Response.json({ error: "baseUrl is required" }, { status: 400 });
  }

  try {
    tool.apply({
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      models: body.models,
      activeModel: body.activeModel,
      subagentModel: body.subagentModel,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to apply config" },
      { status: 500 },
    );
  }
};

// PATCH /api/cli-tools/:id — partial update
const handlePatch: RouteHandler = async (req, params) => {
  const tool = getTool(params?.id ?? "");
  if (!tool) {
    return Response.json({ error: "Tool not found" }, { status: 404 });
  }

  const body = (await req.json()) as Record<string, unknown>;

  // For now, PATCH re-reads and lets the tool handle partial logic.
  // Tools can extend this by checking body fields in their apply().
  try {
    // Re-apply with existing status as base
    const status = tool.read();
    if (!status.configured) {
      return Response.json(
        { error: "Tool not configured yet, use POST first" },
        { status: 400 },
      );
    }

    const details = (status.details ?? {}) as {
      baseUrl?: string;
      models?: string[];
      activeModel?: string;
    };

    const clearActiveModel = body.clearActiveModel === true;
    const removeModel =
      typeof body.removeModel === "string" ? body.removeModel : undefined;

    let models = details.models ?? [];
    let activeModel = details.activeModel ?? undefined;

    if (removeModel) {
      models = models.filter((m: string) => m !== removeModel);
      if (activeModel === removeModel) {
        activeModel = models[0];
      }
    }

    if (clearActiveModel && models.length > 0) {
      activeModel = models[0];
    }

    tool.apply({
      baseUrl: details.baseUrl ?? "http://localhost:3000/v1",
      models,
      activeModel,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 },
    );
  }
};

// DELETE /api/cli-tools/:id — remove config
const handleDelete: RouteHandler = (_req, params) => {
  const tool = getTool(params?.id ?? "");
  if (!tool) {
    return Response.json({ error: "Tool not found" }, { status: 404 });
  }

  try {
    tool.remove();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to reset" },
      { status: 500 },
    );
  }
};

export const cliToolsRoutes: Record<string, RouteHandler> = {
  "GET /api/cli-tools": handleList,
  "GET /api/cli-tools/:id": handleGet,
  "POST /api/cli-tools/:id": handlePost,
  "PATCH /api/cli-tools/:id": handlePatch,
  "DELETE /api/cli-tools/:id": handleDelete,
};
