import { puzzleDate } from "./time";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today's puzzle date. In development, WATTLE_DEV_DATE (YYYY-MM-DD) pretends
 * it's another day so every weekday's game can be tested. It's ignored in
 * production.
 */
export function currentPuzzleDate(now: Date = new Date()): string {
  if (process.env.NODE_ENV !== "production") {
    const override = process.env.WATTLE_DEV_DATE;
    if (override && DATE_RE.test(override)) return override;
  }
  return puzzleDate(now);
}

export function isValidDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}
