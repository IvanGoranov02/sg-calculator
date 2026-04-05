import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_BYTES = 32;

/**
 * 32-byte AES key for encrypting per-user secrets at rest in the DB.
 * Prefer PORTFOLIO_ENCRYPTION_KEY (dedicated, rotatable without touching sessions).
 * If unset, derives from AUTH_SECRET (same secret NextAuth already needs) so you
 * don't need a second env var on Vercel.
 * Changing which key is used invalidates existing encrypted rows until users re-save credentials.
 */
function keyFromAuthSecret(): Buffer | null {
  const s = process.env.AUTH_SECRET;
  if (!s || typeof s !== "string" || s.trim().length < 8) return null;
  return createHash("sha256").update(s.trim(), "utf8").digest();
}

function getKeyBuffer(): Buffer {
  const b64 = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (b64 && typeof b64 === "string") {
    const buf = Buffer.from(b64.trim(), "base64");
    if (buf.length === KEY_BYTES) return buf;
    throw new Error("PORTFOLIO_ENCRYPTION_KEY must decode to 32 bytes (base64-encoded)");
  }
  const derived = keyFromAuthSecret();
  if (derived) return derived;
  throw new Error("Set AUTH_SECRET (NextAuth) or PORTFOLIO_ENCRYPTION_KEY for credential encryption");
}

export function isPortfolioEncryptionConfigured(): boolean {
  const b64 = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (b64 && typeof b64 === "string") {
    try {
      const buf = Buffer.from(b64.trim(), "base64");
      return buf.length === KEY_BYTES;
    } catch {
      return false;
    }
  }
  return keyFromAuthSecret() !== null;
}

/** Stored as base64(iv || tag || ciphertext). */
export function encryptSecret(plain: string): string {
  const key = getKeyBuffer();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const key = getKeyBuffer();
  const buf = Buffer.from(stored, "base64");
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
