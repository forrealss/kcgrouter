import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createHash, webcrypto } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { run } from "../../../db/client";
import { runMigrations } from "../../../db/migrations";
import {
  loginRateLimiter,
  MAX_ATTEMPTS,
} from "../../middleware/login-rate-limit.middleware";
import {
  __testing,
  CHALLENGE_TTL_MS,
  listPasskeys,
} from "../../services/passkey.service";
import { verify } from "../../services/session.service";
import { PUBLIC_PASSKEY_ROUTES, passkeyRoutes } from "../passkey.routes";
import type { RouteHandler } from "../types";

const ORIGIN = "https://kcg.lan";
const RP_ID = "kcg.lan";
const IP = "203.0.113.20";

// ---------------------------------------------------------------------------
// Minimal software authenticator (ES256, "none" attestation)
// ---------------------------------------------------------------------------

const b64url = (bytes: Uint8Array | Buffer) =>
  Buffer.from(bytes).toString("base64url");
const sha256 = (data: Uint8Array | string) =>
  new Uint8Array(createHash("sha256").update(data).digest());

/** WebCrypto returns raw r||s; WebAuthn signatures are DER-encoded. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (bytes: Uint8Array) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    let v = bytes.slice(i);
    if ((v[0] ?? 0) & 0x80) v = new Uint8Array([0, ...v]);
    return new Uint8Array([0x02, v.length, ...v]);
  };
  const r = int(raw.slice(0, 32));
  const s = int(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

class SoftAuthenticator {
  readonly credentialId = crypto.getRandomValues(new Uint8Array(16));
  private keys!: CryptoKeyPair;
  private signCount = 0;

  async init() {
    this.keys = (await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    return this;
  }

  get id() {
    return b64url(this.credentialId);
  }

  private authData(rpId: string, attested?: Uint8Array): Uint8Array {
    // UP | UV, plus AT when attested credential data is present.
    const flags = 0x01 | 0x04 | (attested ? 0x40 : 0);
    const count = new Uint8Array(4);
    new DataView(count.buffer).setUint32(0, this.signCount);
    return new Uint8Array([
      ...sha256(rpId),
      flags,
      ...count,
      ...(attested ?? []),
    ]);
  }

  async register(challenge: string, origin = ORIGIN, rpId = RP_ID) {
    const jwk = await webcrypto.subtle.exportKey("jwk", this.keys.publicKey);
    const cose = new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, new Uint8Array(Buffer.from(jwk.x ?? "", "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y ?? "", "base64url"))],
    ]);
    const idLen = new Uint8Array(2);
    new DataView(idLen.buffer).setUint16(0, this.credentialId.length);
    const attested = new Uint8Array([
      ...new Uint8Array(16), // aaguid
      ...idLen,
      ...this.credentialId,
      ...isoCBOR.encode(cose),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", this.authData(rpId, attested)],
      ]) as never,
    );
    const clientDataJSON = JSON.stringify({
      type: "webauthn.create",
      challenge,
      origin,
      crossOrigin: false,
    });
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: b64url(Buffer.from(clientDataJSON)),
        attestationObject: b64url(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  async assert(challenge: string, origin = ORIGIN, rpId = RP_ID) {
    this.signCount++;
    const authenticatorData = this.authData(rpId);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin }),
    );
    const signed = new Uint8Array([
      ...authenticatorData,
      ...sha256(clientDataJSON),
    ]);
    const raw = new Uint8Array(
      await webcrypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        this.keys.privateKey,
        signed,
      ),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authenticatorData),
        signature: b64url(rawToDer(raw)),
        userHandle: b64url(Buffer.from("kcgrouter-dashboard")),
      },
      clientExtensionResults: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

function handler(key: string): RouteHandler {
  const found = passkeyRoutes[key];
  if (!found) throw new Error(`route ${key} is not registered`);
  return found;
}

async function call(
  key: string,
  opts: {
    body?: unknown;
    origin?: string | null;
    params?: Record<string, string>;
  } = {},
): Promise<Response> {
  const [method, path] = key.split(" ") as [string, string];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.Origin = origin;
  return handler(key)(
    new Request(`http://127.0.0.1:3000${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    opts.params ?? {},
    { clientAddress: IP },
  );
}

async function registerDevice(name = "Test device") {
  const device = await new SoftAuthenticator().init();
  const options = (await (
    await call("POST /api/auth/passkey/register/options")
  ).json()) as { challenge: string };
  const res = await call("POST /api/auth/passkey/register/verify", {
    body: { response: await device.register(options.challenge), name },
  });
  expect(res.status).toBe(201);
  return device;
}

async function loginOptions(origin = ORIGIN) {
  const res = await call("POST /api/auth/passkey/login/options", { origin });
  expect(res.status).toBe(200);
  return (await res.json()) as { challenge: string; rpId: string };
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  run("DELETE FROM webauthn_credentials");
  loginRateLimiter.clear();
  __testing.reset();
});

afterEach(() => {
  loginRateLimiter.clear();
  __testing.reset();
});

// ---------------------------------------------------------------------------

describe("public route list", () => {
  test("exposes only login-related passkey routes", () => {
    expect([...PUBLIC_PASSKEY_ROUTES].sort()).toEqual([
      "GET /api/auth/passkey/available",
      "POST /api/auth/passkey/login/options",
      "POST /api/auth/passkey/login/verify",
    ]);
    for (const key of PUBLIC_PASSKEY_ROUTES) {
      expect(passkeyRoutes[key]).toBeDefined();
    }
  });
});

describe("registration", () => {
  test("registers a passkey pinned to the request origin", async () => {
    await registerDevice("Laptop");
    const [stored] = listPasskeys();
    expect(stored?.name).toBe("Laptop");
    expect(stored?.rp_id).toBe(RP_ID);
  });

  test("rejects plain http on a non-localhost hostname", async () => {
    const res = await call("POST /api/auth/passkey/register/options", {
      origin: "http://kcg.lan:3000",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("HTTPS");
  });

  test("allows http on localhost", async () => {
    const res = await call("POST /api/auth/passkey/register/options", {
      origin: "http://localhost:3000",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rp: { id: string } }).rp.id).toBe(
      "localhost",
    );
  });

  test("allows http on a *.localhost subdomain", async () => {
    const res = await call("POST /api/auth/passkey/register/options", {
      origin: "http://kcg.localhost:3000",
    });
    expect(res.status).toBe(200);
  });

  test("rejects IP-address hosts, which browsers refuse as an RP ID", async () => {
    for (const origin of [
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
      "https://192.168.1.10",
    ]) {
      const res = await call("POST /api/auth/passkey/register/options", {
        origin,
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain(
        "IP address",
      );
    }
  });

  test("rejects a missing Origin header", async () => {
    const res = await call("POST /api/auth/passkey/register/options", {
      origin: null,
    });
    expect(res.status).toBe(400);
  });

  test("rejects a response signed for a different origin", async () => {
    const device = await new SoftAuthenticator().init();
    const options = (await (
      await call("POST /api/auth/passkey/register/options")
    ).json()) as { challenge: string };
    const res = await call("POST /api/auth/passkey/register/verify", {
      body: {
        response: await device.register(options.challenge, "https://evil.test"),
        name: "x",
      },
    });
    expect(res.status).toBe(400);
    expect(listPasskeys()).toHaveLength(0);
  });

  test("a registration challenge cannot be used twice", async () => {
    const device = await new SoftAuthenticator().init();
    const options = (await (
      await call("POST /api/auth/passkey/register/options")
    ).json()) as { challenge: string };
    const response = await device.register(options.challenge);
    const first = await call("POST /api/auth/passkey/register/verify", {
      body: { response, name: "a" },
    });
    expect(first.status).toBe(201);
    const second = await call("POST /api/auth/passkey/register/verify", {
      body: { response, name: "b" },
    });
    expect(second.status).toBe(400);
  });

  test("rejects an over-long name", async () => {
    const device = await new SoftAuthenticator().init();
    const options = (await (
      await call("POST /api/auth/passkey/register/options")
    ).json()) as { challenge: string };
    const res = await call("POST /api/auth/passkey/register/verify", {
      body: {
        response: await device.register(options.challenge),
        name: "x".repeat(65),
      },
    });
    expect(res.status).toBe(400);
  });
});

describe("login", () => {
  test("availability reflects whether any passkey exists", async () => {
    const before = await call("GET /api/auth/passkey/available");
    expect(await before.json()).toEqual({ available: false });
    await registerDevice();
    const after = await call("GET /api/auth/passkey/available");
    expect(await after.json()).toEqual({ available: true });
  });

  test("options return 404 when no passkey is registered", async () => {
    const res = await call("POST /api/auth/passkey/login/options");
    expect(res.status).toBe(404);
  });

  test("options never list credential IDs", async () => {
    await registerDevice();
    const options = (await (
      await call("POST /api/auth/passkey/login/options")
    ).json()) as { allowCredentials?: unknown[] };
    expect(options.allowCredentials ?? []).toHaveLength(0);
  });

  test("a valid assertion signs in and updates usage", async () => {
    const device = await registerDevice();
    const { challenge } = await loginOptions();
    const res = await call("POST /api/auth/passkey/login/verify", {
      body: { response: await device.assert(challenge) },
    });
    expect(res.status).toBe(200);

    const cookie = res.headers.get("Set-Cookie") ?? "";
    const value = /session=([^;]+)/.exec(cookie)?.[1] ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(verify(value)).toBe(true);
    expect(listPasskeys()[0]?.last_used_at).not.toBeNull();
  });

  test("replaying an assertion is rejected", async () => {
    const device = await registerDevice();
    const { challenge } = await loginOptions();
    const response = await device.assert(challenge);
    const first = await call("POST /api/auth/passkey/login/verify", {
      body: { response },
    });
    expect(first.status).toBe(200);
    const replay = await call("POST /api/auth/passkey/login/verify", {
      body: { response },
    });
    expect(replay.status).toBe(400);
    expect(replay.headers.get("Set-Cookie")).toBeNull();
  });

  test("an expired challenge is rejected", async () => {
    const device = await registerDevice();
    let t = Date.now();
    __testing.setNow(() => t);
    const { challenge } = await loginOptions();
    t += CHALLENGE_TTL_MS + 1;
    const res = await call("POST /api/auth/passkey/login/verify", {
      body: { response: await device.assert(challenge) },
    });
    expect(res.status).toBe(400);
  });

  test("an assertion from another origin fails and counts as an attempt", async () => {
    const device = await registerDevice();
    const { challenge } = await loginOptions();
    const res = await call("POST /api/auth/passkey/login/verify", {
      body: {
        response: await device.assert(challenge, "https://evil.test"),
      },
    });
    expect(res.status).toBe(401);
    expect(
      ((await res.json()) as { attemptsRemaining: number }).attemptsRemaining,
    ).toBe(MAX_ATTEMPTS - 1);
  });

  test("an unregistered authenticator is rejected", async () => {
    await registerDevice();
    const stranger = await new SoftAuthenticator().init();
    const { challenge } = await loginOptions();
    const res = await call("POST /api/auth/passkey/login/verify", {
      body: { response: await stranger.assert(challenge) },
    });
    expect(res.status).toBe(401);
  });

  test("malformed bodies do not consume attempts", async () => {
    await registerDevice();
    const res = await call("POST /api/auth/passkey/login/verify", {
      body: { response: { id: "x", response: {} } },
    });
    expect(res.status).toBe(400);
    expect(loginRateLimiter.check(IP).remaining).toBe(MAX_ATTEMPTS);
  });

  test("repeated failures lock the client out", async () => {
    await registerDevice();
    const stranger = await new SoftAuthenticator().init();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const { challenge } = await loginOptions();
      await call("POST /api/auth/passkey/login/verify", {
        body: { response: await stranger.assert(challenge) },
      });
    }
    const blocked = await call("POST /api/auth/passkey/login/options");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });
});

describe("management", () => {
  test("rename and delete", async () => {
    const device = await registerDevice("Old");
    const renamed = await call("PATCH /api/auth/passkeys/:id", {
      params: { id: device.id },
      body: { name: "  New name  " },
    });
    expect(renamed.status).toBe(200);
    expect(listPasskeys()[0]?.name).toBe("New name");

    const blank = await call("PATCH /api/auth/passkeys/:id", {
      params: { id: device.id },
      body: { name: "   " },
    });
    expect(blank.status).toBe(400);

    const removed = await call("DELETE /api/auth/passkeys/:id", {
      params: { id: device.id },
    });
    expect(removed.status).toBe(200);
    expect(listPasskeys()).toHaveLength(0);

    const missing = await call("DELETE /api/auth/passkeys/:id", {
      params: { id: device.id },
    });
    expect(missing.status).toBe(404);
  });
});
