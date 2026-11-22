import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls scheduled routes with `Authorization: Bearer <CRON_SECRET>`.
 * Without CRON_SECRET set, scheduled routes refuse every request.
 */
export function isAuthorizedCron(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
