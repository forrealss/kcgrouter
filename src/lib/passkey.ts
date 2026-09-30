import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { apiClient } from "@/lib/api-client";
import type { Passkey } from "@/types/passkey";

/**
 * Thrown when the user dismisses the browser's passkey prompt (or it times
 * out). Callers treat this as a quiet no-op rather than an error to display.
 */
export class PasskeyCancelledError extends Error {
  constructor() {
    super("Passkey prompt was cancelled");
    this.name = "PasskeyCancelledError";
  }
}

/** IPv4 literal or bracketed IPv6 literal, as `location.hostname` reports it. */
function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
}

/**
 * WebAuthn needs browser support, a secure context (HTTPS or localhost), and
 * a hostname — browsers reject IP addresses as the RP ID, even 127.0.0.1.
 */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !isIpHost(window.location.hostname) &&
    browserSupportsWebAuthn()
  );
}

function isCancel(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}

export async function loginWithPasskey(): Promise<void> {
  const optionsJSON =
    await apiClient.post<PublicKeyCredentialRequestOptionsJSON>(
      "/api/auth/passkey/login/options",
    );
  let response: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (error) {
    if (isCancel(error)) throw new PasskeyCancelledError();
    throw error;
  }
  await apiClient.post("/api/auth/passkey/login/verify", { response });
}

export async function registerPasskey(name: string): Promise<Passkey> {
  const optionsJSON =
    await apiClient.post<PublicKeyCredentialCreationOptionsJSON>(
      "/api/auth/passkey/register/options",
    );
  let response: Awaited<ReturnType<typeof startRegistration>>;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (error) {
    if (isCancel(error)) throw new PasskeyCancelledError();
    if (error instanceof Error && error.name === "InvalidStateError") {
      throw new Error("This device already has a passkey for KCG Router.");
    }
    throw error;
  }
  const result = await apiClient.post<{ passkey: Passkey }>(
    "/api/auth/passkey/register/verify",
    { response, name },
  );
  return result.passkey;
}
