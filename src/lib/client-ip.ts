import { isIP } from "node:net";

/**
 * The header that holds the real client IP, set (and overwritten) by the
 * trusted proxy in front of the app, e.g. "cf-connecting-ip" on Cloudflare,
 * "fly-client-ip" on Fly.io, "x-real-ip" behind a configured nginx.
 *
 * Never use a header the client can set itself (like a raw x-forwarded-for):
 * an attacker could change it on every request to reset IP-based limits.
 */
export function trustedIpHeader(): string | null {
  return process.env.TRUSTED_IP_HEADER?.trim().toLowerCase() || null;
}

/**
 * The client IP from the trusted header, or null if it can't be determined.
 * Callers must treat null as "unknown" and fall back to non-IP limits.
 */
export function clientIp(headers: Headers | undefined | null): string | null {
  const header = trustedIpHeader();
  if (!header) return process.env.NODE_ENV === "development" ? "dev-local" : null;
  const value = headers?.get(header)?.trim();
  // A trusted proxy sets a single address; anything else is suspicious.
  if (!value || value.includes(",") || !isIP(value)) return null;
  return value;
}
