/**
 * Gemini 3 thought-signature handling for Antigravity tool calls.
 *
 * Antigravity requires a thoughtSignature on the first functionCall part when
 * a tool result is sent back. Clients using the OpenAI/Anthropic surface do
 * not know about this Gemini-only field, so we retain upstream signatures in
 * a short-lived process cache and use the same fallback signature as 9router
 * when the client does not echo one back.
 */

const MEMORY_TTL_MS = 60 * 60 * 1000;
const MAX_SIGNATURES = 2_000;

type SignatureEntry = { signature: string; expiresAt: number };
const signatures = new Map<string, SignatureEntry>();

// Ported from 9router/open-sse/config/defaultThinkingSignature.js.
export const DEFAULT_THINKING_AG_SIGNATURE =
  "EuwGCukGAXLI2nxwZIq54WWSoL/YN0P3TsDZ7zRnLi8g0S4aVr2HUGxvaHKySuY6HAVzcE0GPGjXrytLIldxthSvfxgUlJh6Qa9Z+Oj5QZBlYdg6HaJ6yuY5R7waE6rdwBsRf7Ft2j3DJ9rMi9qhWFqApewYtPhls3VHtuvND3l8Rm09+lbAXQs6KKWEWrxNLKTBkfpMgXhRERc/TQRMZu1twAablm6/Zk1tsYRvfWKLsNbeKF+CCojJdXJKvnR/8Ouuoa+Y2Ti20hcW7aZIIjZDFYPU//k6Ybmhg69J/imbFai2ckhfLaisqdDkdoIiBJScTOUvYqP6AE9d4MsydSC+UlhIMk4hoP76R8vUSCZRMkjOaDXstf/QoVZKbt94wyRZgAJ1G0BqI8L5ow86kLpA4wJEtxsRGymOE4bKUvApveBakYDNM9APkf+LbtbzWSseGjoZcSlycF9iN8Q2XNYKRrHbv3Lr5Y8JjdH/5y/6SHkNehTEZugaeGnSPSyCTWto1kQgHpxdWmhkLfJGNUGLmue7Mesj4TSms4J33mRpYVhNB/J333FCqIP0hr/E7BkkjEn7yZ4X7SQlh+xKPurapsnHRwiKmtsilmEFrnTE9iQr+pMr6M29qqFNv1tr5yumbaJw8JW9sB15tNsRv+dW6BjNanbsKz7HCgKUBc8tGy+7YuhXzAfViyRefcjK7eZW0Fbyt7AbybJTKz78W8NH7ye6LAwzOebXpeZ4D43fNIt8bKh26qgduSQv/7o+pAflkuqHZ99YWgHQ8h8OkZFi3eOiSYjsjhdZ/czWOdoPI/OnqIldzMPF5YlrKBLFX8VhRKVmqgsmWf5PHGulHhMkVlS+XG2UIseGy69ARa93D78Gsa+1n1kJr7EEB7Rh+27vUMxVYLdz1yMSvE5nalTAlg/ZeG8+XQ0cHuAI3KbQpHW2Q++RdXfm5JzD5WdJZUU+Zn8t8UUn85BH4RxZLeE0qJikgSsKoYVBc6YhiMjhPgkR95ReimY4Z0xCJdRo1gjexOFeODZMpQF6Yxnoic7IrdgsFA3iePTbFnPp3IAM1fAThWhXJUn3QInUOTd5o1qmTmn6REbL15g/JQNl+dqUoPkhleeb2V3kjqp1okmO3wMZbPknR3S1LZNmlS72/iBQUm+n2b/RCn4PjmM2";

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of signatures) {
    if (entry.expiresAt <= now) signatures.delete(key);
  }
  while (signatures.size > MAX_SIGNATURES) {
    const oldest = signatures.keys().next().value;
    if (!oldest) break;
    signatures.delete(oldest);
  }
}

function keys(toolCallId: string, sessionKey?: string): string[] {
  return sessionKey ? [`${sessionKey}:${toolCallId}`, toolCallId] : [toolCallId];
}

export function storeThoughtSignature(
  toolCallId: string | undefined,
  signature: string | undefined,
  sessionKey?: string,
): void {
  if (!toolCallId || !signature) return;
  prune();
  const entry = { signature, expiresAt: Date.now() + MEMORY_TTL_MS };
  for (const key of keys(toolCallId, sessionKey)) signatures.set(key, entry);
}

export function getThoughtSignature(
  toolCallId: string | undefined,
  sessionKey?: string,
): string | null {
  if (!toolCallId) return null;
  prune();
  for (const key of keys(toolCallId, sessionKey)) {
    const entry = signatures.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.signature;
  }
  return null;
}

export function clearThoughtSignatures(): void {
  signatures.clear();
}
