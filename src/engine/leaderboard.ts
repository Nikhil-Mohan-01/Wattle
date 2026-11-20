import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { FACULTIES } from "@/lib/faculties";
import { addDays, weekdayOf, weekStart } from "@/lib/time";

// ---------------------------------------------------------------------------
// Scoring
//
// Each game scores on its own scale, so raw scores can't be added across days.
// Instead every finished play is turned into DAILY POINTS (0–100): the
// player's percentile among that day's eligible plays.
//
//   eligible = status "done", rawScore not null, and no anti-cheat flags
//   n        = eligible plays that day
//   below    = eligible plays with a strictly lower rawScore
//   ties     = OTHER eligible plays with exactly the same rawScore
//   points   = n == 1 ? 100 : round(100 * (below + 0.5 * ties) / (n - 1))
//
// So the unique best gets 100, the unique worst 0, ties share the midpoint
// (if everyone ties, everyone gets 50), and a lone player gets 100.
// Plays still in progress and flagged plays are left out entirely: they
// earn no points and don't affect anyone else's percentile.
//
// Weekly / term boards add up daily points over the period. Ties are broken
// by more days played, then by who reached their total first (earlier last
// finish time).
//
// Faculty boards: for each faculty over the period
//   avgPoints    = mean daily points per eligible play by its members
//   players      = distinct members with at least one eligible play
//   facultyScore = avgPoints * min(1, players / FACULTY_FULL_STRENGTH)
// so a faculty needs FACULTY_FULL_STRENGTH active players before its average
// counts in full — a couple of strong players can't top the board alone.
// ---------------------------------------------------------------------------

export const FACULTY_FULL_STRENGTH = 10;
export const BOARD_LIMIT = 50;

export type Range = { from: string; to: string }; // inclusive YYYY-MM-DD

export type DailyRow = {
  rank: number;
  userId: string;
  handle: string;
  faculty: string | null;
  gameId: string;
  rawScore: number;
  points: number;
};

export type PeriodRow = {
  rank: number;
  userId: string;
  handle: string;
  faculty: string | null;
  points: number;
  days: number;
};

export type Board<Row> = {
  /** Top rows (at most BOARD_LIMIT). */
  rows: Row[];
  /** The viewer's own row, even if outside the top rows. Null if they haven't scored. */
  me: Row | null;
  /** Number of ranked players. */
  total: number;
};

export type FacultyRow = {
  rank: number;
  faculty: string;
  members: number;
  players: number;
  plays: number;
  avgPoints: number;
  score: number;
};

/**
 * CTE `pts(user_id, date, game_id, raw_score, finished_at, points)`: daily
 * points for every eligible play in the date range. Prefix to a query with
 * `sql\`${dailyPoints(range)} select … from pts\``.
 */
function dailyPoints({ from, to }: Range): SQL {
  return sql`
    with eligible as (
      select p.user_id, p.date, p.game_id, p.raw_score, p.finished_at
      from play p
      where p.date between ${from} and ${to}
        and p.status = 'done'
        and p.raw_score is not null
        and (p.flags is null or p.flags = 'null' or json_array_length(p.flags) = 0)
    ),
    scored as (
      select e.*,
        count(*) over (partition by e.date) as n,
        rank() over (partition by e.date order by e.raw_score) - 1 as below,
        count(*) over (partition by e.date, e.raw_score) - 1 as ties
      from eligible e
    ),
    pts as (
      select user_id, date, game_id, raw_score, finished_at,
        case when n = 1 then 100
             else cast(round(100.0 * (below + 0.5 * ties) / (n - 1)) as integer)
        end as points
      from scored
    )`;
}

/** Daily board for one puzzle date, ranked by raw score (equal scores share a rank). */
export async function dailyBoard(date: string, viewerId: string | null): Promise<Board<DailyRow>> {
  const rows = await db.all<{
    rnk: number;
    user_id: string;
    handle: string | null;
    faculty: string | null;
    game_id: string;
    raw_score: number;
    points: number;
    total: number;
  }>(sql`
    ${dailyPoints({ from: date, to: date })},
    ranked as (
      select pts.*, u.handle, u.faculty,
        rank() over (order by pts.raw_score desc) as rnk,
        row_number() over (order by pts.raw_score desc, pts.finished_at asc, pts.user_id) as pos,
        count(*) over () as total
      from pts join user u on u.id = pts.user_id
    )
    select rnk, user_id, handle, faculty, game_id, raw_score, points, total
    from ranked
    where pos <= ${BOARD_LIMIT} or user_id = ${viewerId ?? ""}
    order by pos`);

  const toRow = (r: (typeof rows)[number]): DailyRow => ({
    rank: Number(r.rnk),
    userId: r.user_id,
    handle: r.handle ?? "—",
    faculty: r.faculty,
    gameId: r.game_id,
    rawScore: Number(r.raw_score),
    points: Number(r.points),
  });
  return splitBoard(rows.map((r) => ({ row: toRow(r), total: Number(r.total) })), viewerId);
}

/** Sum of daily points over a date range (a week or a term). */
export async function periodBoard(range: Range, viewerId: string | null): Promise<Board<PeriodRow>> {
  const rows = await db.all<{
    rnk: number;
    user_id: string;
    handle: string | null;
    faculty: string | null;
    points: number;
    days: number;
    total: number;
  }>(sql`
    ${dailyPoints(range)},
    totals as (
      select user_id, sum(points) as points, count(*) as days, max(finished_at) as last_finish
      from pts group by user_id
    ),
    ranked as (
      select t.*, u.handle, u.faculty,
        rank() over (order by t.points desc, t.days desc, t.last_finish asc) as rnk,
        row_number() over (order by t.points desc, t.days desc, t.last_finish asc, t.user_id) as pos,
        count(*) over () as total
      from totals t join user u on u.id = t.user_id
    )
    select rnk, user_id, handle, faculty, points, days, total
    from ranked
    where pos <= ${BOARD_LIMIT} or user_id = ${viewerId ?? ""}
    order by pos`);

  return splitBoard(
    rows.map((r) => ({
      row: {
        rank: Number(r.rnk),
        userId: r.user_id,
        handle: r.handle ?? "—",
        faculty: r.faculty,
        points: Number(r.points),
        days: Number(r.days),
      },
      total: Number(r.total),
    })),
    viewerId,
  );
}

/** Faculty standings over a date range. Every faculty is listed, even with no plays. */
export async function facultyBoard(range: Range): Promise<FacultyRow[]> {
  const [stats, members] = await Promise.all([
    db.all<{ faculty: string; players: number; plays: number; avg_points: number }>(sql`
      ${dailyPoints(range)}
      select u.faculty as faculty,
        count(distinct pts.user_id) as players,
        count(*) as plays,
        avg(pts.points) as avg_points
      from pts join user u on u.id = pts.user_id
      where u.faculty is not null
      group by u.faculty`),
    db.all<{ faculty: string; members: number }>(sql`
      select faculty, count(*) as members from user
      where faculty is not null and handle is not null
      group by faculty`),
  ]);

  const byFaculty = new Map(stats.map((s) => [s.faculty, s]));
  const memberCount = new Map(members.map((m) => [m.faculty, Number(m.members)]));

  const rows = FACULTIES.map((f) => {
    const s = byFaculty.get(f.id);
    const players = Number(s?.players ?? 0);
    const avgPoints = Number(s?.avg_points ?? 0);
    return {
      rank: 0,
      faculty: f.id as string,
      members: memberCount.get(f.id) ?? 0,
      players,
      plays: Number(s?.plays ?? 0),
      avgPoints: round1(avgPoints),
      score: round1(facultyScore(avgPoints, players)),
    };
  });

  rows.sort((a, b) => b.score - a.score || b.players - a.players || a.faculty.localeCompare(b.faculty));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score === r.score ? prev.rank : i + 1;
  });
  return rows;
}

/** Average points scaled by participation; see the formula at the top of this file. */
export function facultyScore(avgPoints: number, players: number): number {
  return avgPoints * Math.min(1, players / FACULTY_FULL_STRENGTH);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** Monday–Friday of the week containing `date`. */
export function weekRange(date: string): Range {
  const from = weekStart(date);
  return { from, to: addDays(from, 4) };
}

export type Term = Range & { name: string };

/** Waterloo term containing `date`: Winter Jan–Apr, Spring May–Aug, Fall Sep–Dec. */
export function termOf(date: string): Term {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  if (month <= 4) return { name: `Winter ${year}`, from: `${year}-01-01`, to: `${year}-04-30` };
  if (month <= 8) return { name: `Spring ${year}`, from: `${year}-05-01`, to: `${year}-08-31` };
  return { name: `Fall ${year}`, from: `${year}-09-01`, to: `${year}-12-31` };
}

/** The most recent weekday on or before `date` (the latest day with a game). */
export function latestGameDay(date: string): string {
  const wd = weekdayOf(date);
  if (wd === 6) return addDays(date, -1);
  if (wd === 0) return addDays(date, -2);
  return date;
}

// ---------------------------------------------------------------------------

function splitBoard<Row extends { userId: string }>(
  ranked: { row: Row; total: number }[],
  viewerId: string | null,
): Board<Row> {
  const me = viewerId ? (ranked.find((r) => r.row.userId === viewerId)?.row ?? null) : null;
  // The viewer's row is included by the query even past the limit; keep it out of `rows`.
  const rows = ranked.slice(0, BOARD_LIMIT).map((r) => r.row);
  return { rows, me, total: ranked[0]?.total ?? 0 };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
