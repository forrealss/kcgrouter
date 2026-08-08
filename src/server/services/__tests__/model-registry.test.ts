import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { get, run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  importModels,
  listModels,
  previewOpenAIModels,
  previewQoderModels,
} from "../model-registry.service";
import { createProvider, deleteProvider } from "../provider-registry.service";

let restoreFetch: (() => void) | null = null;

function stubFetch(
  handler: (url: string, init: RequestInit) => Promise<Response>,
): void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Catalog payload mirroring /algo/api/v2/model/list. */
function qoderCatalogStub(modelListStatus = 200) {
  return async (url: string): Promise<Response> => {
    if (url.includes("/jobToken/exchange")) {
      return jsonResponse({ token: "jt-sync-test", expires_in: 3600 });
    }
    if (url.includes("/userinfo")) {
      return jsonResponse({ id: "user-sync" });
    }
    if (url.includes("/model/list")) {
      return jsonResponse(
        {
          chat: [
            {
              key: "ultimate",
              display_name: "Ultimate",
              enable: true,
              max_input_tokens: 200_000,
              max_output_tokens: 32_768,
              is_reasoning: false,
            },
            {
              key: "qmodel_latest",
              display_name: "Qwen3.7-Max",
              enable: true,
              max_input_tokens: 131_072,
              max_output_tokens: 16_384,
              is_reasoning: true,
            },
            {
              key: "hidden-model",
              display_name: "Hidden",
              enable: false, // cached but excluded from the usable list
              max_input_tokens: 131_072,
            },
          ],
        },
        modelListStatus,
      );
    }
    return jsonResponse({}, 404);
  };
}

/** OpenAI-compatible GET /models payload. */
function openaiModelsStub(status = 200, data?: unknown) {
  return async (url: string): Promise<Response> => {
    if (!url.endsWith("/models")) return jsonResponse({}, 404);
    return jsonResponse(
      data ?? { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] },
      status,
    );
  };
}

describe("previewQoderModels + importModels", () => {
  beforeAll(() => {
    runMigrations();
    run(
      "DELETE FROM provider_accounts WHERE provider_id IN (SELECT id FROM providers WHERE is_builtin = 0)",
    );
    run("DELETE FROM providers WHERE is_builtin = 0");
    const existing = get("SELECT * FROM app_settings WHERE id = 1");
    if (!existing) {
      run(
        "INSERT INTO app_settings (id, password_hash, theme, token_saver_default_enabled, caveman_enabled, caveman_level, ponytail_enabled, ponytail_level, created_at, updated_at) VALUES (1, ?, ?, ?, 0, 'full', 0, 'full', ?, ?)",
        "",
        "light",
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = null;
  });

  test("preview returns candidates without writing to the DB", async () => {
    const provider = createProvider({
      name: "QoderPreviewTest",
      transport: "qoder",
      baseUrl: "https://api3.qoder.sh",
      prefix: "qoderprev",
    });
    try {
      stubFetch(qoderCatalogStub());

      const candidates = await previewQoderModels(provider.id, "pt-preview-a");
      expect(candidates).toHaveLength(2); // hidden-model has enable:false
      expect(candidates.map((c) => c.modelId)).toEqual(
        expect.arrayContaining(["ultimate", "qmodel_latest"]),
      );
      expect(candidates.every((c) => !c.exists)).toBe(true);

      const qmodel = candidates.find((c) => c.modelId === "qmodel_latest");
      expect(qmodel?.contextLength).toBe(131_072);
      expect(qmodel?.maxOutputTokens).toBe(16_384);

      // Preview alone must not write anything.
      expect(listModels(provider.id)).toHaveLength(0);
    } finally {
      deleteProvider(provider.id);
    }
  });

  test("import adds only the selected models and skips existing ones", async () => {
    const provider = createProvider({
      name: "QoderImportTest",
      transport: "qoder",
      baseUrl: "https://api3.qoder.sh",
      prefix: "qoderimp",
    });
    try {
      stubFetch(qoderCatalogStub());
      const candidates = await previewQoderModels(provider.id, "pt-import-a");

      // Import only one of the two candidates.
      const selected = candidates.filter((c) => c.modelId === "ultimate");
      const first = importModels(
        provider.id,
        selected.map((c) => ({
          modelId: c.modelId,
          modelName: c.modelName,
          contextLength: c.contextLength,
          maxOutputTokens: c.maxOutputTokens,
        })),
      );
      expect(first.added).toBe(1);
      expect(first.skipped).toBe(0);
      expect(first.models).toHaveLength(1);
      expect(first.models[0]?.modelId).toBe("ultimate");

      // Re-importing the same selection skips it.
      const second = importModels(
        provider.id,
        selected.map((c) => ({
          modelId: c.modelId,
          modelName: c.modelName,
        })),
      );
      expect(second.added).toBe(0);
      expect(second.skipped).toBe(1);

      // Preview now flags it as existing.
      const preview = await previewQoderModels(provider.id, "pt-import-a");
      const ultimate = preview.find((c) => c.modelId === "ultimate");
      expect(ultimate?.exists).toBe(true);
    } finally {
      deleteProvider(provider.id);
    }
  });

  test("preview throws a user-facing error when the catalog fetch fails", async () => {
    const provider = createProvider({
      name: "QoderPreviewFail",
      transport: "qoder",
      baseUrl: "https://api3.qoder.sh",
      prefix: "qoderprevfail",
    });
    try {
      stubFetch(qoderCatalogStub(500));
      await expect(
        previewQoderModels(provider.id, "pt-preview-fail"),
      ).rejects.toThrow(/Failed to fetch Qoder models/);
    } finally {
      deleteProvider(provider.id);
    }
  });
});

describe("previewOpenAIModels", () => {
  test("parses the /models data array and flags existing models", async () => {
    const provider = createProvider({
      name: "OpenAIPreviewTest",
      transport: "openai",
      baseUrl: "https://api.example.com/v1",
      prefix: "oaiprev",
    });
    try {
      stubFetch(openaiModelsStub());

      const candidates = await previewOpenAIModels(
        provider.id,
        provider.baseUrl,
        "sk-test",
      );
      expect(candidates).toHaveLength(2);
      expect(candidates[0]).toEqual({
        modelId: "gpt-4o",
        modelName: "gpt-4o",
        exists: false,
      });

      // Import one, then preview flags it.
      importModels(provider.id, [{ modelId: "gpt-4o", modelName: "gpt-4o" }]);
      const again = await previewOpenAIModels(
        provider.id,
        provider.baseUrl,
        "sk-test",
      );
      expect(again.find((c) => c.modelId === "gpt-4o")?.exists).toBe(true);
    } finally {
      deleteProvider(provider.id);
    }
  });

  test("handles trailing-slash base URLs", async () => {
    const provider = createProvider({
      name: "OpenAIPreviewSlash",
      transport: "openai",
      baseUrl: "https://api.example.com/v1/",
      prefix: "oaiprevslash",
    });
    try {
      stubFetch(openaiModelsStub());
      const candidates = await previewOpenAIModels(
        provider.id,
        provider.baseUrl,
        "sk-test",
      );
      expect(candidates).toHaveLength(2);
    } finally {
      deleteProvider(provider.id);
    }
  });

  test("throws on invalid API key", async () => {
    const provider = createProvider({
      name: "OpenAIPreviewAuth",
      transport: "openai",
      baseUrl: "https://api.example.com/v1",
      prefix: "oaiprevauth",
    });
    try {
      stubFetch(openaiModelsStub(401));
      await expect(
        previewOpenAIModels(provider.id, provider.baseUrl, "sk-bad"),
      ).rejects.toThrow(/Invalid API key/);
    } finally {
      deleteProvider(provider.id);
    }
  });

  test("throws when the provider returns no models", async () => {
    const provider = createProvider({
      name: "OpenAIPreviewEmpty",
      transport: "openai",
      baseUrl: "https://api.example.com/v1",
      prefix: "oaiprevempty",
    });
    try {
      stubFetch(openaiModelsStub(200, { data: [] }));
      await expect(
        previewOpenAIModels(provider.id, provider.baseUrl, "sk-test"),
      ).rejects.toThrow(/no models/);
    } finally {
      deleteProvider(provider.id);
    }
  });
});
