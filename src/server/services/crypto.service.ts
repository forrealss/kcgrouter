import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encryptedHex)
    throw new Error("Invalid ciphertext format");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function hashApiKey(key: string): Promise<string> {
  return Bun.password.hash(key);
}

export async function verifyApiKeyHash(
  key: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(key, hash);
}

/**
 * Deterministic digest of an API key, used as the lookup index for auth.
 *
 * Unlike a password, an API key from generateApiKey() carries 256 bits of
 * entropy, so there is no dictionary to attack and a deliberately slow KDF
 * buys nothing. argon2id costs ~190ms per comparison even when it fails, which
 * forced key auth to scan every row; a digest that can be indexed turns that
 * into a single query.
 *
 * This is a lookup key, not a password hash — never use it for user-chosen
 * secrets, where the missing salt and work factor would matter.
 */
export function sha256ApiKey(key: string): string {
  return new Bun.CryptoHasher("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  const bytes = randomBytes(32);
  return `kcg_${bytes.toString("hex")}`;
}
