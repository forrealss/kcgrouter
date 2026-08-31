import type { ProviderTransport } from "../../db/schema";
import { getDefaultModels } from "../providers/registry";
import type { RetryConfig } from "../providers/retry";
import * as ModelRegistry from "../services/model-registry.service";
import * as ProviderRegistry from "../services/provider-registry.service";
import * as RequestLog from "../services/request-log.service";
import * as TestConnection from "../services/test-connection.service";
import type { RouteHandler } from "./types";

const VALID_TRANSPORTS: ProviderTransport[] = [
  "openai",
  "anthropic",
  "gemini",
  "kiro",
  "command-code",
  "mimo",
  "qoder",
];

export const providersRoutes: Record<string, RouteHandler> = {
  "GET /api/providers": () => {
    const providers = ProviderRegistry.listProviders();
    return Response.json(providers);
  },

  "GET /api/providers/:id": (_req, params) => {
    const provider = ProviderRegistry.getProvider(params?.id ?? "");
    if (!provider) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    return Response.json(provider);
  },

  /**
   * Every enabled model across all providers, in one response.
   *
   * Exists so a client building a cross-provider model picker does not have to
   * call `/api/providers/:id/models` once per provider: with 50 providers that
   * was 50 parallel requests per dialog open, which made the picker unusable.
   *
   * The resolver prefers exact matches over patterns, so this is reached before
   * `GET /api/providers/models/:transport` treats "all" as a transport name.
   */
  "GET /api/providers/models/all": () => {
    return Response.json(ModelRegistry.listAllEnabledModels());
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
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: `Provider "${provider.name}" created`,
        latencyMs: null,
      });
      return Response.json(provider, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "PUT /api/providers/:id/retry-config": async (req, params) => {
    const providerId = params?.id ?? "";
    let body: { retryConfig?: RetryConfig | null };
    try {
      body = (await req.json()) as { retryConfig?: RetryConfig | null };
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (body.retryConfig === undefined) {
      return Response.json(
        {
          error:
            "retryConfig is required (object of status-code rules, or null to reset)",
        },
        { status: 400 },
      );
    }
    if (
      body.retryConfig !== null &&
      (typeof body.retryConfig !== "object" || Array.isArray(body.retryConfig))
    ) {
      return Response.json(
        { error: "retryConfig must be an object of status-code rules or null" },
        { status: 400 },
      );
    }

    try {
      const provider = ProviderRegistry.updateProviderRetryConfig(
        providerId,
        body.retryConfig,
      );
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: provider.retryConfig
          ? `Retry policy for provider "${provider.name}" updated`
          : `Retry policy for provider "${provider.name}" reset to defaults`,
        latencyMs: null,
      });
      return Response.json(provider);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "DELETE /api/providers/:id": (_req, params) => {
    const providerId = params?.id ?? "";
    const existing = ProviderRegistry.getProvider(providerId);
    try {
      ProviderRegistry.deleteProvider(providerId);
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: existing
          ? `Provider "${existing.name}" deleted`
          : `Provider with ID "${providerId}" deleted`,
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

  "GET /api/providers/:id/accounts": (_req, params) => {
    const accounts = ProviderRegistry.listAccounts(params?.id ?? "");
    return Response.json(accounts);
  },

  "POST /api/providers/:id/accounts": async (req, params) => {
    const body = (await req.json()) as {
      label?: string;
      apiKey?: string;
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
        quotaLimitTokens: body.quotaLimitTokens,
      });
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: account.id,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: `Account "${account.label}" created`,
        latencyMs: null,
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
      quotaLimitTokens?: number | null;
    };
    try {
      const account = ProviderRegistry.updateAccount(params?.id ?? "", {
        label: body.label,
        apiKey: body.apiKey,
        quotaLimitTokens: body.quotaLimitTokens,
      });
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: account.id,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: `Account "${account.label}" updated`,
        latencyMs: null,
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
    const accountId = params?.id ?? "";
    const existing = ProviderRegistry.getAccount(accountId);
    try {
      ProviderRegistry.removeAccount(accountId);
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: existing
          ? `Account "${existing.label}" deleted`
          : `Account with ID "${accountId}" deleted`,
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
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: model.modelId,
        sourceFormat: null,
        stream: false,
        message: `Model "${model.modelName}" (${model.modelId}) added`,
        latencyMs: null,
      });
      return Response.json(model, { status: 201 });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 400 },
      );
    }
  },

  "POST /api/providers/:id/models/fetch": async (_req, params) => {
    const providerId = params?.id ?? "";
    const provider = ProviderRegistry.getProvider(providerId);
    if (!provider) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    if (
      provider.transport !== "qoder" &&
      provider.transport !== "openai" &&
      provider.transport !== "mimo"
    ) {
      return Response.json(
        {
          error:
            "Model fetching is only supported for OpenAI-compatible, Mimo, and Qoder providers",
        },
        { status: 400 },
      );
    }

    const accounts = ProviderRegistry.listAccounts(providerId);
    const account = accounts.find((a) =>
      ProviderRegistry.isAccountAvailable(a),
    );
    if (!account) {
      return Response.json(
        {
          error: "Add an available connection before fetching models",
        },
        { status: 400 },
      );
    }

    try {
      const credential = ProviderRegistry.getDecryptedCredential(account.id);
      const candidates =
        provider.transport === "qoder"
          ? await ModelRegistry.previewQoderModels(
              providerId,
              credential.apiKey,
            )
          : await ModelRegistry.previewOpenAIModels(
              providerId,
              provider.baseUrl,
              credential.apiKey,
            );
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: account.id,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: `Fetched ${candidates.length} candidate models for provider "${provider.name}"`,
        latencyMs: null,
      });
      return Response.json({ models: candidates });
    } catch (err) {
      return Response.json(
        {
          error: err instanceof Error ? err.message : "Failed to fetch models",
        },
        { status: 502 },
      );
    }
  },

  "POST /api/providers/:id/models/import": async (req, params) => {
    const providerId = params?.id ?? "";
    const provider = ProviderRegistry.getProvider(providerId);
    if (!provider) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      models?: Array<{
        modelId?: string;
        modelName?: string;
        contextLength?: number;
        maxOutputTokens?: number;
      }>;
    };
    const selections = Array.isArray(body.models) ? body.models : [];
    if (selections.length === 0) {
      return Response.json(
        { error: "Select at least one model to import" },
        { status: 400 },
      );
    }

    try {
      const result = ModelRegistry.importModels(
        providerId,
        selections.map((m) => ({
          modelId: m.modelId ?? "",
          modelName: m.modelName ?? "",
          contextLength: m.contextLength,
          maxOutputTokens: m.maxOutputTokens,
        })),
      );
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message: `Imported ${result.added} model(s) for provider "${provider.name}" (${result.skipped} already existed)`,
        latencyMs: null,
      });
      return Response.json(result);
    } catch (err) {
      return Response.json(
        {
          error: err instanceof Error ? err.message : "Failed to import models",
        },
        { status: 400 },
      );
    }
  },

  "PATCH /api/providers/models/:modelId/toggle": (_req, params) => {
    const modelId = params?.modelId ?? "";
    try {
      const enabled = ModelRegistry.toggleModel(modelId);
      const model = ModelRegistry.getModel(modelId);
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: model?.modelId ?? modelId,
        sourceFormat: null,
        stream: false,
        message: `Model "${model?.modelName ?? modelId}" ${enabled ? "enabled" : "disabled"}`,
        latencyMs: null,
      });
      return Response.json({ enabled });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 404 },
      );
    }
  },

  "DELETE /api/providers/models/:modelId": (_req, params) => {
    const modelId = params?.modelId ?? "";
    const existing = ModelRegistry.getModel(modelId);
    try {
      ModelRegistry.deleteModel(modelId);
      RequestLog.record({
        type: "admin",
        source: "admin",
        providerAccountId: null,
        comboId: null,
        model: existing?.modelId ?? modelId,
        sourceFormat: null,
        stream: false,
        message: `Model "${existing?.modelName ?? modelId}" deleted`,
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

  // --- Test endpoints ---

  "POST /api/providers/accounts/:id/test": async (_req, params) => {
    const accountId = params?.id ?? "";
    let result: TestConnection.TestConnectionResult;
    try {
      result = await TestConnection.testConnection(accountId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Test connection failed";
      if (ProviderRegistry.getAccount(accountId)) {
        ProviderRegistry.recordAccountError(accountId, message);
      }
      RequestLog.record({
        type: "error",
        source: "test",
        providerAccountId: accountId,
        comboId: null,
        model: null,
        sourceFormat: null,
        stream: false,
        message,
        latencyMs: null,
      });
      return Response.json(
        { status: "error", latencyMs: 0, error: message },
        { status: 500 },
      );
    }
    const account = ProviderRegistry.getAccount(accountId);
    if (account) {
      if (result.status === "ok") {
        ProviderRegistry.recordAccountSuccess(accountId);
      } else {
        ProviderRegistry.recordAccountError(
          accountId,
          result.error ?? "Test connection failed",
        );
      }
    }
    RequestLog.record({
      type: result.status === "ok" ? "success" : "error",
      source: "test",
      providerAccountId: account ? accountId : null,
      comboId: null,
      model: null,
      sourceFormat: null,
      stream: false,
      message: result.error ?? null,
      latencyMs: result.latencyMs,
    });
    if (result.status === "ok") {
      return Response.json(result);
    }
    return Response.json(result, { status: 400 });
  },

  "POST /api/providers/models/:modelId/test": async (req, params) => {
    const body = (await req.json()) as { accountId?: string };
    const modelId = params?.modelId ?? "";
    if (!body.accountId) {
      RequestLog.record({
        type: "error",
        source: "test",
        providerAccountId: null,
        comboId: null,
        model: modelId,
        sourceFormat: null,
        stream: false,
        message: "accountId is required",
        latencyMs: null,
      });
      return Response.json({ error: "accountId is required" }, { status: 400 });
    }
    let result: TestConnection.TestModelResult;
    try {
      result = await TestConnection.testModel(body.accountId, modelId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test model failed";
      if (ProviderRegistry.getAccount(body.accountId)) {
        ProviderRegistry.recordAccountError(body.accountId, message);
      }
      RequestLog.record({
        type: "error",
        source: "test",
        providerAccountId: body.accountId,
        comboId: null,
        model: modelId,
        sourceFormat: null,
        stream: false,
        message,
        latencyMs: null,
      });
      return Response.json(
        { status: "error", latencyMs: 0, error: message },
        { status: 500 },
      );
    }
    const account = ProviderRegistry.getAccount(body.accountId);
    if (account) {
      if (result.status === "ok") {
        ProviderRegistry.recordAccountSuccess(body.accountId);
      } else {
        ProviderRegistry.recordAccountError(
          body.accountId,
          result.error ?? "Test model failed",
        );
      }
    }
    RequestLog.record({
      type: result.status === "ok" ? "success" : "error",
      source: "test",
      providerAccountId: account ? body.accountId : null,
      comboId: null,
      model: modelId,
      sourceFormat: null,
      stream: false,
      message: result.error ?? null,
      latencyMs: result.latencyMs,
    });
    if (result.status === "ok") {
      return Response.json(result);
    }
    return Response.json(result, { status: 400 });
  },
};
