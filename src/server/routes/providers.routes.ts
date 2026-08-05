import type { ProviderTransport } from "../../db/schema";
import { getDefaultModels } from "../providers/registry";
import * as ModelRegistry from "../services/model-registry.service";
import * as ProviderRegistry from "../services/provider-registry.service";
import * as TestConnection from "../services/test-connection.service";
import type { RouteHandler } from "./types";

const VALID_TRANSPORTS: ProviderTransport[] = [
  "openai",
  "anthropic",
  "gemini",
  "kiro",
  "command-code",
  "mimo",
];

export const providersRoutes: Record<string, RouteHandler> = {
  "GET /api/providers": () => {
    const providers = ProviderRegistry.listProviders();
    return Response.json(providers);
  },

  "GET /api/providers/models/:transport": (_req, params) => {
    const transport = params?.transport as ProviderTransport;
    if (!transport || !VALID_TRANSPORTS.includes(transport)) {
      // Try as provider ID
      const provider = ProviderRegistry.getProvider(params?.transport ?? "");
      if (provider) {
        const models = getDefaultModels(provider.transport);
        return Response.json(models);
      }
      return Response.json(
        { error: "Invalid transport type" },
        { status: 400 },
      );
    }
    const models = getDefaultModels(transport);
    return Response.json(models);
  },

  "POST /api/providers": async (req) => {
    const body = (await req.json()) as {
      name?: string;
      transport?: string;
      baseUrl?: string;
      prefix?: string;
    };
    if (!body.name || !body.transport || !body.baseUrl || !body.prefix) {
      return Response.json(
        { error: "name, transport, baseUrl, and prefix are required" },
        { status: 400 },
      );
    }

    const transport = body.transport as ProviderTransport;
    if (!VALID_TRANSPORTS.includes(transport)) {
      return Response.json(
        { error: "Invalid transport type" },
        { status: 400 },
      );
    }

    try {
      const provider = ProviderRegistry.createProvider({
        name: body.name,
        transport,
        baseUrl: body.baseUrl,
        prefix: body.prefix,
      });
      return Response.json(provider, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "DELETE /api/providers/:id": (_req, params) => {
    try {
      ProviderRegistry.deleteProvider(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 404 },
      );
    }
  },

  "GET /api/providers/:id/accounts": (_req, params) => {
    const accounts = ProviderRegistry.listAccounts(params?.id ?? "");
    return Response.json(accounts);
  },

  "POST /api/providers/:id/accounts": async (req, params) => {
    const body = (await req.json()) as {
      label?: string;
      apiKey?: string;
      quotaResetType?: string;
      quotaLimitTokens?: number | null;
    };
    if (!body.label || !body.apiKey) {
      return Response.json(
        { error: "label and apiKey are required" },
        { status: 400 },
      );
    }

    try {
      const account = ProviderRegistry.addAccount(params?.id ?? "", {
        label: body.label,
        apiKey: body.apiKey,
        quotaResetType: body.quotaResetType as
          | "5h"
          | "daily"
          | "weekly"
          | "none",
        quotaLimitTokens: body.quotaLimitTokens,
      });
      return Response.json(account, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "PATCH /api/providers/accounts/:id": async (req, params) => {
    const body = (await req.json()) as {
      label?: string;
      apiKey?: string;
      quotaResetType?: string;
      quotaLimitTokens?: number | null;
    };
    try {
      const account = ProviderRegistry.updateAccount(params?.id ?? "", {
        label: body.label,
        apiKey: body.apiKey,
        quotaResetType: body.quotaResetType as
          | "5h"
          | "daily"
          | "weekly"
          | "none",
        quotaLimitTokens: body.quotaLimitTokens,
      });
      return Response.json(account);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "DELETE /api/providers/accounts/:id": (_req, params) => {
    try {
      ProviderRegistry.removeAccount(params?.id ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 404 },
      );
    }
  },

  // --- Model management ---

  "GET /api/providers/:id/models": (_req, params) => {
    const models = ModelRegistry.listModels(params?.id ?? "");
    return Response.json(models);
  },

  "POST /api/providers/:id/models": async (req, params) => {
    const body = (await req.json()) as {
      modelId?: string;
      modelName?: string;
      contextLength?: number;
      maxOutputTokens?: number;
    };
    if (!body.modelId || !body.modelName) {
      return Response.json(
        { error: "modelId and modelName are required" },
        { status: 400 },
      );
    }
    try {
      const model = ModelRegistry.addModel(
        params?.id ?? "",
        body.modelId,
        body.modelName,
        body.contextLength,
        body.maxOutputTokens,
      );
      return Response.json(model, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "PATCH /api/providers/models/:modelId/toggle": (_req, params) => {
    try {
      const enabled = ModelRegistry.toggleModel(params?.modelId ?? "");
      return Response.json({ enabled });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 404 },
      );
    }
  },

  "DELETE /api/providers/models/:modelId": (_req, params) => {
    try {
      ModelRegistry.deleteModel(params?.modelId ?? "");
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 404 },
      );
    }
  },

  // --- Test endpoints ---

  "POST /api/providers/accounts/:id/test": async (_req, params) => {
    const accountId = params?.id ?? "";
    const result = await TestConnection.testConnection(accountId);
    if (result.status === "ok") {
      return Response.json(result);
    }
    return Response.json(result, { status: 400 });
  },

  "POST /api/providers/models/:modelId/test": async (req, params) => {
    const body = (await req.json()) as { accountId?: string };
    if (!body.accountId) {
      return Response.json({ error: "accountId is required" }, { status: 400 });
    }
    const modelId = params?.modelId ?? "";
    const result = await TestConnection.testModel(body.accountId, modelId);
    if (result.status === "ok") {
      return Response.json(result);
    }
    return Response.json(result, { status: 400 });
  },
};
