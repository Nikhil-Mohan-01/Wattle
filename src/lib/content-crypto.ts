// AES-256-GCM encryption for puzzle content banks. Kept free of app imports
// and non-erasable TypeScript so scripts/content.mjs can import it directly.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Envelope = { v: 1; alg: "aes-256-gcm"; iv: string; tag: string; data: string };

/** Parses CONTENT_KEY: 32 random bytes, base64-encoded. */
export function parseContentKey(base64: string | undefined): Buffer | null {
  if (!base64) return null;
  const key = Buffer.from(base64.trim(), "base64");
  return key.length === 32 ? key : null;
}

export function generateContentKey(): string {
  return randomBytes(32).toString("base64");
}

/** Encrypts `plaintext`; `name` is bound to the ciphertext so files can't be swapped. */
export function encryptContent(plaintext: string, name: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  return JSON.stringify(envelope);
}

/** Decrypts and authenticates; throws if the key is wrong or the file was altered. */
export function decryptContent(file: string, name: string, key: Buffer): string {
  const env = JSON.parse(file) as Envelope;
  if (env.v !== 1 || env.alg !== "aes-256-gcm") throw new Error("Unknown encrypted content format.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(env.data, "base64")), decipher.final()]).toString("utf8");
}
