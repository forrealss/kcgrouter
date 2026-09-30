import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { get, query, run } from "../../db/client";
import type { WebAuthnCredentialRow } from "../../db/schema";

/**
 * Passkey (WebAuthn) login for the single dashboard user.
 *
 * Trust model:
 * - Registration requires an existing session, so the Origin header the
 *   browser sends is trusted to name the dashboard's public origin (it may sit
 *   behind a reverse proxy, so `req.url` cannot be relied on).
 * - Login never trusts request headers for verification: each credential is
 *   verified against the rp_id/origin it was registered with.
 * - Challenges are random, short-lived, single-use, and bound to their purpose.
 */

const RP_NAME = "KCG Router";
/** Stable handle for the single user, so an authenticator keeps one entry. */
const USER_ID = new TextEncoder().encode("kcgrouter-dashboard");
const USER_NAME = "admin";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Upper bound on pending challenges; the login-options route is public. */
const MAX_PENDING_CHALLENGES = 200;
export const MAX_PASSKEY_NAME_LENGTH = 64;

type Purpose = "registration" | "authentication";

interface PendingChallenge {
  purpose: Purpose;
  rpID: string;
  origin: string;
  expiresAt: number;
}

export class PasskeyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

// ---------------------------------------------------------------------------
// Challenge store
// ---------------------------------------------------------------------------

const pending = new Map<string, PendingChallenge>();
let now: () => number = Date.now;

/** Test hook: drive the clock and reset state. */
export const __testing = {
  setNow(fn: () => number) {
    now = fn;
  },
  reset() {
    pending.clear();
    now = Date.now;
  },
  get pendingCount() {
    return pending.size;
  },
};

function pruneChallenges(): void {
  const t = now();
  for (const [key, entry] of pending) {
    if (entry.expiresAt <= t) pending.delete(key);
  }
  // Map iterates in insertion order, so this drops the oldest first.
  while (pending.size >= MAX_PENDING_CHALLENGES) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
}

function storeChallenge(
  challenge: string,
  entry: Omit<PendingChallenge, "expiresAt">,
) {
  pruneChallenges();
  pending.set(challenge, { ...entry, expiresAt: now() + CHALLENGE_TTL_MS });
}

/** Remove and return a challenge. Single-use even when verification fails. */
function takeChallenge(challenge: string, purpose: Purpose): PendingChallenge {
  const entry = pending.get(challenge);
  pending.delete(challenge);
  if (!entry || entry.purpose !== purpose || entry.expiresAt <= now()) {
    throw new PasskeyError("Passkey challenge expired. Try again.", 400);
  }
  return entry;
}

/** Read the challenge the browser signed, without trusting anything else. */
function challengeFromClientData(clientDataJSON: unknown): string {
  if (typeof clientDataJSON !== "string") {
    throw new PasskeyError("Invalid passkey response", 400);
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: unknown };
    if (typeof parsed.challenge === "string" && parsed.challenge.length > 0) {
      return parsed.challenge;
    }
  } catch {
    // fall through
  }
  throw new PasskeyError("Invalid passkey response", 400);
}

// ---------------------------------------------------------------------------
// Origin handling
// ---------------------------------------------------------------------------

export interface RelyingParty {
  origin: string;
  rpID: string;
}

/** True for IPv4 literals and bracketed IPv6 literals (as URL.hostname gives). */
export function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
}

/**
 * Resolve the dashboard's public origin from the browser's Origin header.
 *
 * Two browser rules are enforced up front so the user gets a clear message
 * instead of an opaque SecurityError from the authenticator prompt:
 * - WebAuthn needs a secure context: https, or http on localhost.
 * - The RP ID must be a domain name. Browsers reject IP addresses (including
 *   127.0.0.1) even over https.
 */
export function relyingPartyFromRequest(req: Request): RelyingParty {
  const header = req.headers.get("origin");
  if (!header) {
    throw new PasskeyError("Missing Origin header", 400);
  }
  let url: URL;
  try {
    url = new URL(header);
  } catch {
    throw new PasskeyError("Invalid Origin header", 400);
  }
  const host = url.hostname;
  if (isIpHost(host)) {
    throw new PasskeyError(
      `Passkeys do not work on an IP address (${host}). Open the dashboard via a hostname such as localhost or a domain.`,
      400,
    );
  }
  const loopback = host === "localhost" || host.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new PasskeyError(
      "Passkeys need HTTPS (or localhost). Open the dashboard over HTTPS to use them.",
      400,
    );
  }
  return { origin: url.origin, rpID: host };
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface PasskeyPublic {
  id: string;
  name: string;
  rp_id: string;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

function toPublic(row: WebAuthnCredentialRow): PasskeyPublic {
  return {
    id: row.id,
    name: row.name,
    rp_id: row.rp_id,
    device_type: row.device_type,
    backed_up: row.backed_up === 1,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

function parseTransports(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? (value.filter((t) => typeof t === "string") as string[])
      : undefined;
  } catch {
    return undefined;
  }
}

export function listPasskeys(): PasskeyPublic[] {
  return query<WebAuthnCredentialRow>(
    "SELECT * FROM webauthn_credentials ORDER BY created_at DESC",
  ).map(toPublic);
}

export function hasPasskeys(): boolean {
  return !!get<{ n: number }>(
    "SELECT 1 AS n FROM webauthn_credentials LIMIT 1",
  );
}

function normalizeName(name: unknown, fallback?: string): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    if (fallback) return fallback;
    throw new PasskeyError("Name is required", 400);
  }
  if (trimmed.length > MAX_PASSKEY_NAME_LENGTH) {
    throw new PasskeyError(
      `Name must be at most ${MAX_PASSKEY_NAME_LENGTH} characters`,
      400,
    );
  }
  return trimmed;
}

export function renamePasskey(id: string, name: unknown): PasskeyPublic {
  const row = get<WebAuthnCredentialRow>(
    "SELECT * FROM webauthn_credentials WHERE id = ?",
    id,
  );
  if (!row) throw new PasskeyError("Passkey not found", 404);
  const next = normalizeName(name);
  run("UPDATE webauthn_credentials SET name = ? WHERE id = ?", next, id);
  return toPublic({ ...row, name: next });
}

export function deletePasskey(id: string): void {
  const row = get<{ id: string }>(
    "SELECT id FROM webauthn_credentials WHERE id = ?",
    id,
  );
  if (!row) throw new PasskeyError("Passkey not found", 404);
  run("DELETE FROM webauthn_credentials WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Registration (session required — enforced by the router)
// ---------------------------------------------------------------------------

export async function startRegistration(
  rp: RelyingParty,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = query<WebAuthnCredentialRow>(
    "SELECT * FROM webauthn_credentials WHERE rp_id = ?",
    rp.rpID,
  );
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userID: USER_ID,
    userName: USER_NAME,
    userDisplayName: RP_NAME,
    attestationType: "none",
    // Stops the same authenticator from being registered twice.
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      // Discoverable credentials let login skip any username step.
      residentKey: "required",
      userVerification: "preferred",
    },
  });
  storeChallenge(options.challenge, { purpose: "registration", ...rp });
  return options;
}

export async function finishRegistration(
  response: unknown,
  name: unknown,
): Promise<PasskeyPublic> {
  const body = response as RegistrationResponseJSON | null;
  const challenge = challengeFromClientData(body?.response?.clientDataJSON);
  const expected = takeChallenge(challenge, "registration");

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: body as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: expected.origin,
      expectedRPID: expected.rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    throw new PasskeyError(
      `Passkey registration failed: ${err instanceof Error ? err.message : String(err)}`,
      400,
    );
  }
  if (!verification.verified) {
    throw new PasskeyError("Passkey registration could not be verified", 400);
  }

  const info = verification.registrationInfo;
  const { credential } = info;
  if (get("SELECT id FROM webauthn_credentials WHERE id = ?", credential.id)) {
    throw new PasskeyError("This passkey is already registered", 409);
  }

  const row: WebAuthnCredentialRow = {
    id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports
      ? JSON.stringify(credential.transports)
      : null,
    name: normalizeName(
      name,
      `Passkey ${new Date().toISOString().slice(0, 10)}`,
    ),
    rp_id: expected.rpID,
    origin: expected.origin,
    device_type: info.credentialDeviceType,
    backed_up: info.credentialBackedUp ? 1 : 0,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  run(
    `INSERT INTO webauthn_credentials
       (id, public_key, counter, transports, name, rp_id, origin, device_type, backed_up, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.public_key,
    row.counter,
    row.transports,
    row.name,
    row.rp_id,
    row.origin,
    row.device_type,
    row.backed_up,
    row.created_at,
    row.last_used_at,
  );
  return toPublic(row);
}

// ---------------------------------------------------------------------------
// Authentication (public — rate limited by the route)
// ---------------------------------------------------------------------------

export async function startAuthentication(
  rp: RelyingParty,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    // Empty list = discoverable login: the browser offers whatever passkeys
    // it holds for this site, and no credential IDs leak to anonymous callers.
    allowCredentials: [],
    userVerification: "preferred",
  });
  storeChallenge(options.challenge, { purpose: "authentication", ...rp });
  return options;
}

/**
 * Verify a login assertion. Resolves on success; throws PasskeyError (401 for
 * a failed credential check, 400 for malformed/expired requests) otherwise.
 */
export async function finishAuthentication(response: unknown): Promise<void> {
  const body = response as AuthenticationResponseJSON | null;
  const challenge = challengeFromClientData(body?.response?.clientDataJSON);
  takeChallenge(challenge, "authentication");

  const credentialId = typeof body?.id === "string" ? body.id : "";
  const row = credentialId
    ? get<WebAuthnCredentialRow>(
        "SELECT * FROM webauthn_credentials WHERE id = ?",
        credentialId,
      )
    : null;
  if (!row) throw new PasskeyError("Passkey not recognized", 401);

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: body as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      // Pinned to where the credential was registered, not request headers.
      expectedOrigin: row.origin,
      expectedRPID: row.rp_id,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(Buffer.from(row.public_key, "base64url")),
        counter: row.counter,
        transports: parseTransports(row.transports),
      },
      requireUserVerification: false,
    });
  } catch {
    throw new PasskeyError("Passkey verification failed", 401);
  }
  if (!verification.verified) {
    throw new PasskeyError("Passkey verification failed", 401);
  }

  run(
    "UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE id = ?",
    verification.authenticationInfo.newCounter,
    new Date().toISOString(),
    row.id,
  );
}
