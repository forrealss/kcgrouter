import { afterEach, describe, expect, test } from "bun:test";
import {
  compareVersions,
  fetchLatestVersion,
  getVersionInfo,
  isNewer,
  parseSemver,
  resetVersionCache,
} from "../version.service";

let restoreFetch: (() => void) | null = null;

function stubFetch(handler: () => Promise<Response>): void {
  const original = globalThis.fetch;
  globalThis.fetch = (() => handler()) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
  resetVersionCache();
});

describe("parseSemver", () => {
  test("parses a stable release", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
  });

  test("tolerates a v prefix and build metadata", () => {
    expect(parseSemver("v1.2.3+build.5")?.patch).toBe(3);
  });

  test("keeps prerelease identifiers instead of producing NaN", () => {
    expect(parseSemver("0.11.0-beta.1")).toEqual({
      major: 0,
      minor: 11,
      patch: 0,
      prerelease: ["beta", 1],
    });
  });

  test("returns null for unusable input", () => {
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });
});

describe("compareVersions", () => {
  function cmp(a: string, b: string): number {
    const left = parseSemver(a);
    const right = parseSemver(b);
    if (!left || !right) throw new Error("bad fixture");
    return compareVersions(left, right);
  }

  test("orders by major, minor, then patch", () => {
    expect(cmp("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(cmp("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(cmp("1.2.3", "1.2.4")).toBeLessThan(0);
    expect(cmp("1.2.3", "1.2.3")).toBe(0);
  });

  test("ranks a prerelease below its stable release", () => {
    expect(cmp("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
    expect(cmp("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
  });

  test("compares numeric prerelease identifiers numerically", () => {
    expect(cmp("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0);
  });

  test("ranks numeric identifiers below alphanumeric ones", () => {
    expect(cmp("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
  });

  test("treats a longer identifier list as greater when otherwise equal", () => {
    expect(cmp("1.0.0-beta", "1.0.0-beta.1")).toBeLessThan(0);
  });
});

describe("isNewer", () => {
  test("detects a genuine upgrade", () => {
    expect(isNewer("0.10.4", "0.11.0")).toBe(true);
  });

  test("rejects equal and older candidates", () => {
    expect(isNewer("0.10.4", "0.10.4")).toBe(false);
    expect(isNewer("0.10.4", "0.10.3")).toBe(false);
  });

  test("does not treat a prerelease as newer than its stable release", () => {
    expect(isNewer("1.0.0", "1.0.0-beta.1")).toBe(false);
  });

  test("recognises a prerelease of a higher version as newer", () => {
    expect(isNewer("1.0.0", "1.1.0-beta.1")).toBe(true);
  });

  test("returns false when the candidate is missing or unparseable", () => {
    expect(isNewer("1.0.0", null)).toBe(false);
    expect(isNewer("1.0.0", "garbage")).toBe(false);
  });
});

describe("fetchLatestVersion", () => {
  test("returns the published version", async () => {
    stubFetch(async () => Response.json({ version: "9.9.9" }));
    expect(await fetchLatestVersion()).toBe("9.9.9");
  });

  test("returns null on a non-ok response", async () => {
    stubFetch(async () => new Response("nope", { status: 503 }));
    expect(await fetchLatestVersion()).toBeNull();
  });

  test("returns null when the request throws", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    expect(await fetchLatestVersion()).toBeNull();
  });
});

describe("getVersionInfo", () => {
  test("flags a failed lookup instead of reporting 0.0.0", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });

    const info = await getVersionInfo();
    expect(info.latest).toBeNull();
    expect(info.checkFailed).toBe(true);
    expect(info.updateAvailable).toBe(false);
    expect(info.updateCommand).toBe("");
  });

  test("reports no update when already current", async () => {
    stubFetch(async () => Response.json({ version: "0.0.1" }));

    const info = await getVersionInfo();
    expect(info.checkFailed).toBe(false);
    expect(isNewer(info.current, info.latest)).toBe(info.updateAvailable);
  });

  test("supplies an update command only when an upgrade exists", async () => {
    stubFetch(async () => Response.json({ version: "999.0.0" }));

    const info = await getVersionInfo();
    expect(info.updateAvailable).toBe(true);
    expect(info.updateCommand).toMatch(/kcgrouter$/);
  });

  test("serves a cached result without refetching", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls += 1;
      return Response.json({ version: "999.0.0" });
    });

    await getVersionInfo();
    await getVersionInfo();
    expect(calls).toBe(1);
  });

  test("refetches after the cache is reset", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls += 1;
      return Response.json({ version: "999.0.0" });
    });

    await getVersionInfo();
    resetVersionCache();
    await getVersionInfo();
    expect(calls).toBe(2);
  });
});
