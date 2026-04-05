import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_BYTES = 32;

function getKeyBuffer(): Buffer {
  const b64 = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("PORTFOLIO_ENCRYPTION_KEY is not set");
  }
  const buf = Buffer.from(b64.trim(), "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error("PORTFOLIO_ENCRYPTION_KEY must decode to 32 bytes (base64-encoded)");
  }
  return buf;
}

export function isPortfolioEncryptionConfigured(): boolean {
  const b64 = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (!b64 || typeof b64 !== "string") return false;
  try {
    const buf = Buffer.from(b64.trim(), "base64");
    return buf.length === KEY_BYTES;
  } catch {
    return false;
  }
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
