import { afterAll, describe, expect, mock, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeTool } from "../claude";
import { coworkTool } from "../cowork";

// Isolate all home-dir writes from the real user home. Bun caches
// os.homedir() at process start, so set HOME at runtime doesn't work —
// mock the whole node:os module instead.
const tmpBase = process.env.TMPDIR ?? "/tmp";
var testHome: string;

mock.module("node:os", () => ({
  homedir: () => {
    testHome ??= mkdtempSync(join(tmpBase, "kcg-cli-tools-"));
    return testHome;
  },
  tmpdir: () => tmpBase,
}));

afterAll(() => {
  if (testHome) rmSync(testHome, { recursive: true, force: true });
});

function readJsonFile(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
}

const claudeConfigPath = () => join(testHome, ".claude", "settings.json");
const coworkConfigDir = () =>
  join(testHome, ".config", "Claude-3p", "configLibrary");

describe("claudeTool (Claude Code)", () => {
  test("read returns not-configured before any apply", () => {
    const status = claudeTool.read();
    expect(typeof status.installed).toBe("boolean");
    expect(status.configured).toBe(false);
  });

  test("apply writes env vars and normalizes /v1", () => {
    claudeTool.apply({
      baseUrl: "http://localhost:4000",
      apiKey: "sk-test",
      models: ["cc/claude-sonnet-5", "cc/claude-opus-5"],
      activeModel: "cc/claude-sonnet-5",
    });

    const config = readJsonFile(claudeConfigPath());
    const env = config.env as Record<string, unknown>;
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:4000/v1");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-test");
    expect(env.ANTHROPIC_MODEL).toBe("cc/claude-sonnet-5");
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("cc/claude-sonnet-5");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("cc/claude-opus-5");
  });

  test("read reflects the applied config", () => {
    const status = claudeTool.read();
    expect(status.configured).toBe(true);
    expect(status.details?.baseUrl).toBe("http://localhost:4000/v1");
    expect(status.details?.activeModel).toBe("cc/claude-sonnet-5");
    const models = status.details?.models as string[];
    expect(models).toContain("cc/claude-sonnet-5");
    expect(models).toContain("cc/claude-opus-5");
  });

  test("re-apply rebuilds role slots and drops stale models", () => {
    claudeTool.apply({
      baseUrl: "http://localhost:4000/v1",
      models: ["cc/claude-haiku-4-5-20251001"],
      activeModel: "cc/claude-haiku-4-5-20251001",
    });

    const env = readJsonFile(claudeConfigPath()).env as Record<string, unknown>;
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(
      "cc/claude-haiku-4-5-20251001",
    );
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
  });

  test("apply writes role slots verbatim from the roleSlots payload", () => {
    claudeTool.apply({
      baseUrl: "http://localhost:4000/v1",
      apiKey: "sk-test",
      roleSlots: {
        ANTHROPIC_DEFAULT_SONNET_MODEL: "cc/claude-sonnet-5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "cc/claude-opus-5",
      },
    });

    const env = readJsonFile(claudeConfigPath()).env as Record<string, unknown>;
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("cc/claude-sonnet-5");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("cc/claude-opus-5");
    // Empty slots are dropped, not left stale.
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined();
    expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBeUndefined();
    // Generic ANTHROPIC_MODEL from a previous apply is cleared.
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
  });

  test("read exposes roleSlots keyed by env key", () => {
    const status = claudeTool.read();
    const roleSlots = status.details?.roleSlots as Record<string, string>;
    expect(roleSlots.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("cc/claude-sonnet-5");
    expect(roleSlots.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("cc/claude-opus-5");
  });

  test("remove deletes managed env vars but keeps unrelated settings", () => {
    // Add an unrelated key first, then reset.
    const config = readJsonFile(claudeConfigPath());
    config.extraSetting = true;
    writeFileSync(claudeConfigPath(), JSON.stringify(config, null, 2));

    claudeTool.remove();

    const after = readJsonFile(claudeConfigPath());
    expect(after.extraSetting).toBe(true);
    const env = (after.env ?? {}) as Record<string, unknown>;
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(claudeTool.read().configured).toBe(false);
  });
});

describe("coworkTool (Claude Cowork)", () => {
  test("isInstalled reflects the isolated home state", () => {
    expect(typeof coworkTool.isInstalled()).toBe("boolean");
  });

  test("apply requires an api key", () => {
    expect(() =>
      coworkTool.apply({
        baseUrl: "http://localhost:4000/v1",
        models: ["cc/x"],
      }),
    ).toThrow(/API key/);
  });

  test("apply requires at least one model", () => {
    expect(() =>
      coworkTool.apply({
        baseUrl: "http://localhost:4000/v1",
        apiKey: "sk-test",
        models: [],
      }),
    ).toThrow(/minimal satu model/);
  });

  test("apply writes meta + config into configLibrary", () => {
    coworkTool.apply({
      baseUrl: "http://localhost:4000/v1",
      apiKey: "sk-test",
      models: ["cc/claude-sonnet-5", "cc/claude-haiku-4-5-20251001"],
    });

    const metaPath = join(coworkConfigDir(), "_meta.json");
    expect(existsSync(metaPath)).toBe(true);
    const meta = readJsonFile(metaPath);
    const appliedId = meta.appliedId as string;
    expect(typeof appliedId).toBe("string");
    expect(meta.entries).toEqual([{ id: appliedId, name: "Default" }]);

    const cfgPath = join(coworkConfigDir(), `${appliedId}.json`);
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = readJsonFile(cfgPath);
    expect(cfg.inferenceProvider).toBe("gateway");
    expect(cfg.inferenceGatewayBaseUrl).toBe("http://localhost:4000/v1");
    expect(cfg.inferenceGatewayApiKey).toBe("sk-test");
    expect(cfg.inferenceModels).toEqual([
      { name: "cc/claude-sonnet-5" },
      { name: "cc/claude-haiku-4-5-20251001" },
    ]);
  });

  test("apply bootstraps 3p deployment mode in the 1p config", () => {
    const onePConfig = join(
      testHome,
      ".config",
      "Claude",
      "claude_desktop_config.json",
    );
    expect(existsSync(onePConfig)).toBe(true);
    expect(readJsonFile(onePConfig).deploymentMode).toBe("3p");
  });

  test("read reflects the applied cowork config", () => {
    const status = coworkTool.read();
    expect(status.installed).toBe(true);
    expect(status.configured).toBe(true);
    expect(status.details?.baseUrl).toBe("http://localhost:4000/v1");
    const models = status.details?.models as string[];
    expect(models).toContain("cc/claude-sonnet-5");
    expect(models).toContain("cc/claude-haiku-4-5-20251001");
  });

  test("remove resets the config file", () => {
    coworkTool.remove();
    const status = coworkTool.read();
    expect(status.configured).toBe(false);
  });
});
