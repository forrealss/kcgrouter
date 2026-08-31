import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PORT,
  getAppVersion,
  getConfigPath,
  getConfiguredPort,
  getPort,
  getRecordedVersion,
  getServerPort,
  isDefaultPasswordHintEnabled,
  isValidPort,
  loadConfig,
  recordVersion,
  saveConfig,
  setDefaultPasswordHintEnabled,
} from "../config";

const originalHome = process.env.KCGRouter_HOME;
const originalPort = process.env.PORT;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  // Restore env regardless of test outcome
  if (originalHome) process.env.KCGRouter_HOME = originalHome;
  else delete process.env.KCGRouter_HOME;
  if (originalPort) process.env.PORT = originalPort;
  else delete process.env.PORT;
  if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
  else delete process.env.NODE_ENV;
});

function withTempHome(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "kcgrouter-config-"));
  process.env.KCGRouter_HOME = dir;
  delete process.env.PORT;
  try {
    fn();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("app config", () => {
  test("defaults to port 3000 when nothing is configured", () => {
    withTempHome(() => {
      expect(getPort()).toBe(DEFAULT_PORT);
    });
  });

  test("reads port from config.json", () => {
    withTempHome(() => {
      saveConfig({ port: 8080 });
      expect(loadConfig()).toEqual({ port: 8080 });
      expect(getPort()).toBe(8080);
    });
  });

  test("PORT env var overrides config.json", () => {
    withTempHome(() => {
      saveConfig({ port: 8080 });
      process.env.PORT = "9090";
      expect(getPort()).toBe(9090);
    });
  });

  test("saveConfig merges with existing config", () => {
    withTempHome(() => {
      saveConfig({ port: 1234 });
      saveConfig({ port: 5678 });
      expect(loadConfig()).toEqual({ port: 5678 });
    });
  });

  test("invalid config.json falls back to defaults", () => {
    withTempHome(() => {
      writeFileSync(getConfigPath(), "not json{");
      expect(loadConfig()).toEqual({});
      expect(getPort()).toBe(DEFAULT_PORT);
    });
  });

  test("invalid port value in config.json falls back to defaults", () => {
    withTempHome(() => {
      saveConfig({ port: -5 });
      expect(getPort()).toBe(DEFAULT_PORT);
    });
  });

  test("config file is written to the KCG Router home dir", () => {
    withTempHome(() => {
      saveConfig({ port: 4000 });
      const home = process.env.KCGRouter_HOME ?? "";
      expect(getConfigPath()).toBe(join(home, "config.json"));
      expect(loadConfig()).toEqual({ port: 4000 });
    });
  });

  describe("isValidPort", () => {
    test.each([1, 3000, 65535])("accepts valid port %d", (port) => {
      expect(isValidPort(port)).toBe(true);
    });

    test.each([0, -1, 65536, 3.5, Number.NaN])(
      "rejects out-of-range or non-integer port %p",
      (port) => {
        expect(isValidPort(port)).toBe(false);
      },
    );

    test.each(["8080", null, undefined, {}])(
      "rejects non-number value %p",
      (value) => {
        expect(isValidPort(value)).toBe(false);
      },
    );
  });

  describe("getServerPort", () => {
    test("dev mode ignores config.json and falls back to the default", () => {
      withTempHome(() => {
        delete process.env.NODE_ENV;
        saveConfig({ port: 8080 });
        expect(getServerPort()).toBe(DEFAULT_PORT);
      });
    });

    test("dev mode respects the PORT env var", () => {
      withTempHome(() => {
        delete process.env.NODE_ENV;
        saveConfig({ port: 8080 });
        process.env.PORT = "9090";
        expect(getServerPort()).toBe(9090);
      });
    });

    test("production mode honors config.json", () => {
      withTempHome(() => {
        process.env.NODE_ENV = "production";
        saveConfig({ port: 8080 });
        expect(getServerPort()).toBe(8080);
      });
    });

    test("production mode prefers the PORT env var over config.json", () => {
      withTempHome(() => {
        process.env.NODE_ENV = "production";
        saveConfig({ port: 8080 });
        process.env.PORT = "9090";
        expect(getServerPort()).toBe(9090);
      });
    });
  });

  describe("version upgrade tracking", () => {
    test("getAppVersion returns a non-empty package.json version", () => {
      withTempHome(() => {
        expect(typeof getAppVersion()).toBe("string");
        expect(getAppVersion().length).toBeGreaterThan(0);
      });
    });

    test("getRecordedVersion is undefined when never recorded", () => {
      withTempHome(() => {
        expect(getRecordedVersion()).toBeUndefined();
      });
    });

    test("recordVersion persists the version and preserves the port", () => {
      withTempHome(() => {
        saveConfig({ port: 8080 });
        recordVersion("9.9.9");
        expect(loadConfig()).toEqual({ port: 8080, version: "9.9.9" });
        expect(getRecordedVersion()).toBe("9.9.9");
      });
    });

    test("recordVersion defaults to the running app version", () => {
      withTempHome(() => {
        recordVersion();
        expect(getRecordedVersion()).toBe(getAppVersion());
      });
    });
  });

  describe("getConfiguredPort", () => {
    test("returns undefined when nothing is configured", () => {
      withTempHome(() => {
        expect(getConfiguredPort()).toBeUndefined();
      });
    });

    test("returns the port from config.json", () => {
      withTempHome(() => {
        saveConfig({ port: 8080 });
        expect(getConfiguredPort()).toBe(8080);
      });
    });

    test("ignores the PORT env var", () => {
      withTempHome(() => {
        process.env.PORT = "9090";
        expect(getConfiguredPort()).toBeUndefined();
      });
    });

    test("returns undefined for an invalid port in config.json", () => {
      withTempHome(() => {
        saveConfig({ port: -5 });
        expect(getConfiguredPort()).toBeUndefined();
      });
    });
  });

  describe("default password hint", () => {
    test("is enabled on a fresh install with no config file", () => {
      withTempHome(() => {
        expect(isDefaultPasswordHintEnabled()).toBe(true);
      });
    });

    test("stays enabled when the config exists but omits the flag", () => {
      withTempHome(() => {
        saveConfig({ port: 8080 });
        expect(isDefaultPasswordHintEnabled()).toBe(true);
      });
    });

    test("only an explicit false disables it", () => {
      withTempHome(() => {
        setDefaultPasswordHintEnabled(false);
        expect(isDefaultPasswordHintEnabled()).toBe(false);
        expect(loadConfig().showDefaultPasswordHint).toBe(false);
      });
    });

    test("can be re-enabled", () => {
      withTempHome(() => {
        setDefaultPasswordHintEnabled(false);
        setDefaultPasswordHintEnabled(true);
        expect(isDefaultPasswordHintEnabled()).toBe(true);
      });
    });

    test("writing the flag preserves the configured port", () => {
      withTempHome(() => {
        saveConfig({ port: 4321 });
        setDefaultPasswordHintEnabled(false);
        expect(getConfiguredPort()).toBe(4321);
        expect(isDefaultPasswordHintEnabled()).toBe(false);
      });
    });
  });
});
