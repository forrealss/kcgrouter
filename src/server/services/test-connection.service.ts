import { randomUUID } from "node:crypto";
import type { ProviderTransport } from "../../db/schema";
import { getAdapter } from "../providers/registry";
import * as ModelRegistry from "./model-registry.service";
import * as ProviderRegistry from "./provider-registry.service";

export interface TestConnectionResult {
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}

export interface TestModelResult {
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}

// Probe tuning, verified against api.commandcode.ai with a reasoning model
// (xiaomi/mimo-v2.5-pro):
//   "test" @ 16  -> finishReason "length", 0 visible chars, 67 reasoning chars
//   "test" @ 512 -> finishReason "stop",   "Ready. What do you need?"
//   this prompt @ 256 -> finishReason "stop", "OK"
// A directive prompt keeps thinking short; the ceiling covers thinking plus a
// brief answer without making the probe expensive.
const PROBE_PROMPT = "Reply with exactly one word: OK";
const PROBE_MAX_TOKENS = 256;

function resolveTestModelId(
  providerId: string,
  transport: ProviderTransport,
): string {
  const enabled = ModelRegistry.listEnabledModels(providerId);
  const first = enabled[0];
  if (first) return first.modelId;

  const defaults: Record<ProviderTransport, string> = {
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-20241022",
    gemini: "gemini-1.5-flash",
    kiro: "claude-haiku-4.5",
    "command-code": "deepseek/deepseek-v4-flash",
    mimo: "mimo-v2-flash",
    qoder: "ultimate",
  };
  return defaults[transport];
}

async function testOpenAIModelsEndpoint(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; status: number }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return { ok: res.ok, status: res.status };
}

async function testOpenAIConnection(
  providerId: string,
  baseUrl: string,
  credential: { apiKey: string },
): Promise<TestConnectionResult> {
  const start = Date.now();

  // 1. Try GET /models first (cheapest, no model dependency)
  const modelsResult = await testOpenAIModelsEndpoint(
    baseUrl,
    credential.apiKey,
  );

  if (modelsResult.ok) {
    return { status: "ok", latencyMs: Date.now() - start };
  }

  // 401/403 = definitely bad key
  if (modelsResult.status === 401 || modelsResult.status === 403) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: "Invalid API key",
    };
  }

  // 2. /models unavailable — fallback to a minimal chat completion
  const modelId = resolveTestModelId(providerId, "openai");
  const adapter = getAdapter("openai");

  try {
    await adapter.send(
      {
        messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
        maxTokens: 1,
        stream: false,
      },
      credential,
      modelId,
      baseUrl,
    );
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function testConnection(
  accountId: string,
): Promise<TestConnectionResult> {
  const account = ProviderRegistry.getAccount(accountId);
  if (!account) {
    return { status: "error", latencyMs: 0, error: "Account not found" };
  }

  const provider = ProviderRegistry.getProvider(account.providerId);
  if (!provider) {
    return { status: "error", latencyMs: 0, error: "Provider not found" };
  }

  const credential = ProviderRegistry.getDecryptedCredential(accountId);

  // Command Code uses a special validation approach
  if (provider.transport === "command-code") {
    return testCommandCodeConnection(credential.apiKey);
  }

  // OpenAI-compatible: GET /models first, fallback to chat completion
  if (provider.transport === "openai" || provider.transport === "mimo") {
    return testOpenAIConnection(provider.id, provider.baseUrl, credential);
  }

  // Anthropic, Gemini, Kiro: use adapter with a resolved model
  const adapter = getAdapter(provider.transport);
  const modelId = resolveTestModelId(provider.id, provider.transport);

  const start = Date.now();
  try {
    await adapter.send(
      {
        messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
        maxTokens: 1,
        stream: false,
      },
      credential,
      modelId,
      provider.baseUrl,
    );
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function testCommandCodeConnection(
  apiKey: string,
): Promise<TestConnectionResult> {
  const url = "https://api.commandcode.ai/alpha/generate";
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-command-code-version": "0.25.7",
        "x-cli-environment": "cli",
        "x-project-slug": "pi-cc",
        "x-taste-learning": "false",
        "x-co-flag": "false",
        "x-session-id": randomUUID(),
      },
      body: JSON.stringify({
        config: {
          workingDir: "/workspace",
          date: new Date().toISOString().slice(0, 10),
          environment: "external",
          structure: [],
          isGitRepo: false,
          currentBranch: "",
          mainBranch: "",
          gitStatus: "",
          recentCommits: [],
        },
        memory: "",
        taste: "",
        skills: "",
        permissionMode: "standard",
        params: {
          model: "deepseek/deepseek-v4-flash",
          messages: [{ role: "user", content: "test" }],
          tools: [],
          system: "",
          max_tokens: 1,
          stream: true,
        },
      }),
    });

    // Omnirouter logic: 200, 400, 422, 429 = key is valid
    // Only 401/403 = invalid key
    if (res.status === 401 || res.status === 403) {
      return {
        status: "error",
        latencyMs: Date.now() - start,
        error: "Invalid API key",
      };
    }

    if (
      res.ok ||
      res.status === 400 ||
      res.status === 422 ||
      res.status === 429
    ) {
      return { status: "ok", latencyMs: Date.now() - start };
    }

    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: `API returned ${res.status}`,
    };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function testModel(
  accountId: string,
  modelId: string,
): Promise<TestModelResult> {
  const account = ProviderRegistry.getAccount(accountId);
  if (!account) {
    return { status: "error", latencyMs: 0, error: "Account not found" };
  }

  const provider = ProviderRegistry.getProvider(account.providerId);
  if (!provider) {
    return { status: "error", latencyMs: 0, error: "Provider not found" };
  }

  const credential = ProviderRegistry.getDecryptedCredential(accountId);
  const adapter = getAdapter(provider.transport);

  const start = Date.now();
  try {
    const res = await adapter.send(
      {
        messages: [
          {
            role: "user",
            // An explicit, trivially answerable instruction. A bare "test"
            // makes reasoning models deliberate about what is being asked,
            // burning the token budget before any visible text is emitted.
            content: [{ type: "text", text: PROBE_PROMPT }],
          },
        ],
        // Reasoning models spend this budget on internal thinking first, so a
        // small ceiling (1, or even 16) returns finishReason "length" with zero
        // visible tokens. Leave enough headroom for thinking plus a short
        // answer, while keeping the probe cheap.
        maxTokens: PROBE_MAX_TOKENS,
        // The response body is always a stream of events, so a non-stream
        // request yields nothing parseable.
        stream: true,
      },
      credential,
      modelId,
      provider.baseUrl,
    );

    // A 2xx alone isn't proof the model works — verify it actually produced
    // something usable.
    const produced = res.message.content.some(
      (part) =>
        (part.type === "text" && part.text.trim().length > 0) ||
        part.type === "tool_call",
    );
    if (!produced) {
      // finishReason "length" here means the budget was consumed before any
      // visible token, which is a probe-tuning problem rather than a dead
      // model. Say so, otherwise this reads as a provider failure.
      const hint =
        res.finishReason === "length"
          ? "Model produced no visible output before hitting the token limit (likely spent on reasoning)"
          : "Model returned an empty response";
      return { status: "error", latencyMs: Date.now() - start, error: hint };
    }

    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
