// All puzzle days are defined in Waterloo's local time, so midnight rolls
// over for everyone at the same moment regardless of where they play from.

export const TIMEZONE = "America/Toronto";

/** The puzzle day as YYYY-MM-DD in Toronto time. */
export function puzzleDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD date string. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Shift a YYYY-MM-DD date by a number of days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the week containing the given date. */
export function weekStart(date: string): string {
  const wd = weekdayOf(date);
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(date, offset);
}
