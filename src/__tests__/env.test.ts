import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSecrets, getSecretsFile } from "../env";

const originalHome = process.env.KCGRouter_HOME;
const originalEncryptionKey = process.env.ENCRYPTION_KEY;
const originalSessionSecret = process.env.SESSION_SECRET;

afterEach(() => {
  // Restore env regardless of test outcome
  if (originalHome) process.env.KCGRouter_HOME = originalHome;
  else delete process.env.KCGRouter_HOME;
  if (originalEncryptionKey) process.env.ENCRYPTION_KEY = originalEncryptionKey;
  else delete process.env.ENCRYPTION_KEY;
  if (originalSessionSecret) process.env.SESSION_SECRET = originalSessionSecret;
  else delete process.env.SESSION_SECRET;
});

function withTempHome(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "kcgrouter-env-"));
  process.env.KCGRouter_HOME = dir;
  delete process.env.ENCRYPTION_KEY;
  delete process.env.SESSION_SECRET;
  try {
    fn();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("ensureSecrets", () => {
  test("generates both keys and persists them to ~/.kcgrouter/.env", () => {
    withTempHome(() => {
      expect(process.env.ENCRYPTION_KEY).toBeUndefined();
      expect(process.env.SESSION_SECRET).toBeUndefined();

      ensureSecrets();

      expect(process.env.ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
      expect(process.env.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);
      expect(process.env.ENCRYPTION_KEY).not.toBe(process.env.SESSION_SECRET);

      const file = getSecretsFile();
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, "utf-8");
      expect(content).toContain(`ENCRYPTION_KEY=${process.env.ENCRYPTION_KEY}`);
      expect(content).toContain(`SESSION_SECRET=${process.env.SESSION_SECRET}`);
    });
  });

  test("writes the secrets file with mode 0600", () => {
    withTempHome(() => {
      ensureSecrets();
      // Windows does not model POSIX permissions
      const mode = statSync(getSecretsFile()).mode;
      if (process.platform !== "win32") {
        expect(mode & 0o777).toBe(0o600);
      }
    });
  });

  test("is idempotent — second call keeps the same keys", () => {
    withTempHome(() => {
      ensureSecrets();
      const firstKey = process.env.ENCRYPTION_KEY;
      ensureSecrets();
      expect(process.env.ENCRYPTION_KEY).toBe(firstKey);
    });
  });

  test("loads existing keys from the file without regenerating", () => {
    withTempHome(() => {
      const dir = process.env.KCGRouter_HOME ?? "";
      writeFileSync(
        join(dir, ".env"),
        "ENCRYPTION_KEY=abcdef\nSESSION_SECRET=123456\n",
        { mode: 0o600 },
      );

      ensureSecrets();

      expect(process.env.ENCRYPTION_KEY).toBe("abcdef");
      expect(process.env.SESSION_SECRET).toBe("123456");
    });
  });

  test("does not override env vars that are already set", () => {
    withTempHome(() => {
      const dir = process.env.KCGRouter_HOME ?? "";
      writeFileSync(
        join(dir, ".env"),
        "ENCRYPTION_KEY=from-file\nSESSION_SECRET=from-file\n",
        { mode: 0o600 },
      );
      process.env.ENCRYPTION_KEY = "from-shell";

      ensureSecrets();

      expect(process.env.ENCRYPTION_KEY).toBe("from-shell");
      // SESSION_SECRET was not set in the shell → taken from the file
      expect(process.env.SESSION_SECRET).toBe("from-file");
    });
  });

  test("fills only missing keys and preserves the rest of the file", () => {
    withTempHome(() => {
      const dir = process.env.KCGRouter_HOME ?? "";
      writeFileSync(
        join(dir, ".env"),
        "ENCRYPTION_KEY=existing-key\nCUSTOM_VAR=hello\n",
        { mode: 0o600 },
      );

      ensureSecrets();

      expect(process.env.ENCRYPTION_KEY).toBe("existing-key");
      expect(process.env.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);

      const content = readFileSync(getSecretsFile(), "utf-8");
      expect(content).toContain("ENCRYPTION_KEY=existing-key");
      expect(content).toContain("CUSTOM_VAR=hello");
      expect(content).toContain("SESSION_SECRET=");
    });
  });
});
