import { execSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type VersionInfo = {
  current: string;
  /** `null` when the registry could not be reached. */
  latest: string | null;
  updateAvailable: boolean;
  /** `true` when the last registry lookup failed, so the UI can say so. */
  checkFailed: boolean;
  packageManager: string;
  /** Empty unless an upgrade is actually available. */
  updateCommand: string;
  checkedAt: number;
};

const REGISTRY_URL = "https://registry.npmjs.org/kcgrouter/latest";
const REGISTRY_TIMEOUT_MS = 5000;
const SUCCESS_TTL = 60 * 60 * 1000; // 1 hour
const FAILURE_TTL = 5 * 60 * 1000; // retry sooner after a failed lookup

let cache: VersionInfo | null = null;

type Semver = {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers; empty for a stable release. */
  prerelease: (string | number)[];
};

/**
 * Parses a semver string, tolerating a `v` prefix, prerelease suffixes and
 * build metadata. Returns `null` when the core `x.y.z` triple is unusable, so
 * callers can distinguish "unparseable" from "0.0.0".
 */
export function parseSemver(input: string): Semver | null {
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      input.trim(),
    );
  if (!match) return null;

  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease
      ? prerelease.split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id))
      : [],
  };
}

/**
 * Compares prerelease identifier lists per semver §11: a version with a
 * prerelease ranks below the same core version without one, numeric
 * identifiers compare numerically, and a longer list wins all else equal.
 */
function comparePrerelease(
  a: (string | number)[],
  b: (string | number)[],
): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }

  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Returns a negative number when `a < b`, 0 when equal, positive when `a > b`. */
export function compareVersions(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * True when `candidate` is a strictly newer release than `currentVersion`.
 * Unparseable input yields `false` — we never prompt on a version we cannot
 * reason about.
 */
export function isNewer(
  currentVersion: string,
  candidate: string | null,
): boolean {
  if (!candidate) return false;
  const current = parseSemver(currentVersion);
  const next = parseSemver(candidate);
  if (!current || !next) return false;
  return compareVersions(current, next) < 0;
}

export function getCurrentVersion(): string {
  try {
    const pkgPath = join(import.meta.dir, "../../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Infers the package manager that owns this global install by inspecting the
 * install path, falling back to whichever CLI is on PATH. Bun's global links
 * live under `.bun/install/global`, so the path is a stronger signal than mere
 * availability of the `bun` binary.
 */
export function detectPackageManager(): { name: string; updateCmd: string } {
  const bun = { name: "bun", updateCmd: "bun i -g kcgrouter" };
  const npm = { name: "npm", updateCmd: "npm i -g kcgrouter" };

  try {
    const path = realpathSync(import.meta.dir).replace(/\\/g, "/");
    if (path.includes("/.bun/")) return bun;
    if (/\/(node_modules|lib\/node_modules)\//.test(path)) return npm;
  } catch {}

  try {
    execSync("bun --version", { stdio: "pipe" });
    return bun;
  } catch {
    return npm;
  }
}

/** Fetches the published `latest` version, or `null` when unreachable. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Cached view of the local vs published version. Successful lookups are held
 * for an hour; failures are retried after five minutes so a transient outage
 * does not suppress the notice for a full hour.
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  const now = Date.now();
  if (cache) {
    const ttl = cache.checkFailed ? FAILURE_TTL : SUCCESS_TTL;
    if (now - cache.checkedAt < ttl) return cache;
  }

  const current = getCurrentVersion();
  const latest = await fetchLatestVersion();
  const updateAvailable = isNewer(current, latest);
  const pm = detectPackageManager();

  cache = {
    current,
    latest,
    updateAvailable,
    checkFailed: latest === null,
    packageManager: pm.name,
    updateCommand: updateAvailable ? pm.updateCmd : "",
    checkedAt: now,
  };

  return cache;
}

/** Drops the cache so the next read re-queries the registry. */
export function resetVersionCache(): void {
  cache = null;
}
