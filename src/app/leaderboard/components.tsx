import Link from "next/link";
import type { ReactNode } from "react";
import type { Board, DailyRow, FacultyRow, PeriodRow } from "@/engine/leaderboard";
import { facultyName } from "@/lib/faculties";
import { GAMES, type GameId } from "@/lib/games";
import { addDays } from "@/lib/time";

export const TABS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "term", label: "This term" },
  { id: "faculty", label: "Faculties" },
] as const;

export type Tab = (typeof TABS)[number]["id"];

function href(tab: Tab, week: string | null): string {
  const q = new URLSearchParams({ tab });
  if (week) q.set("week", week);
  return `/leaderboard?${q}`;
}

export function Tabs({ active, week }: { active: Tab; week: string | null }) {
  return (
    <nav aria-label="Leaderboards" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-card p-1">
      {TABS.map((t) => {
        const isActive = t.id === active;
        // Keep the selected week when switching between the week-based tabs.
        const keepWeek = t.id === "week" || t.id === "faculty" ? week : null;
        return (
          <Link
            key={t.id}
            href={href(t.id, keepWeek)}
            aria-current={isActive ? "page" : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-center text-sm font-medium ${
              isActive ? "bg-gold text-black" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function WeekNav({
  tab,
  week,
  thisWeek,
  label,
}: {
  tab: Tab;
  week: string;
  thisWeek: string;
  label: string;
}) {
  const prev = addDays(week, -7);
  const next = addDays(week, 7);
  const linkClass = "rounded-lg border border-line px-2.5 py-1 text-sm hover:border-gold";
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={href(tab, prev)} className={linkClass} aria-label="Previous week">
        ←
      </Link>
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted">
        {label}
        <span className="block text-xs font-normal normal-case">
          {formatRange(week, addDays(week, 4))}
        </span>
      </h2>
      {week < thisWeek ? (
        <Link
          href={href(tab, next === thisWeek ? null : next)}
          className={linkClass}
          aria-label="Next week"
        >
          →
        </Link>
      ) : (
        <span className={`${linkClass} invisible`} aria-hidden>
          →
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player tables
// ---------------------------------------------------------------------------

type Column<Row> = { label: string; className?: string; cell: (r: Row) => ReactNode };

function PlayerTable<Row extends { userId: string; rank: number; handle: string; faculty: string | null }>({
  board,
  viewerId,
  columns,
  empty,
}: {
  board: Board<Row>;
  viewerId: string | null;
  columns: Column<Row>[];
  empty: string;
}) {
  if (board.total === 0) return <BoardNote>{empty}</BoardNote>;
  const meOutside = board.me && !board.rows.some((r) => r.userId === board.me!.userId);

  const row = (r: Row, key: string) => {
    const mine = r.userId === viewerId;
    return (
      <tr key={key} className={`border-t border-line ${mine ? "bg-gold/15 font-semibold" : ""}`}>
        <td className="py-2 pl-3 pr-2 tabular-nums text-muted">{r.rank}</td>
        <td className="max-w-[10rem] py-2 pr-2">
          <div className="truncate">
            {r.handle}
            {mine && <span className="ml-1 text-xs font-normal text-gold-deep">(you)</span>}
          </div>
          <div className="truncate text-xs font-normal text-muted sm:hidden">{facultyName(r.faculty)}</div>
        </td>
        <td className="hidden py-2 pr-2 text-muted sm:table-cell">{facultyName(r.faculty)}</td>
        {columns.map((c) => (
          <td key={c.label} className={`py-2 pr-3 text-right tabular-nums ${c.className ?? ""}`}>
            {c.cell(r)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      {board.me && <YourRank rank={board.me.rank} total={board.total} />}
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pl-3 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Player</th>
              <th className="hidden py-2 pr-2 font-medium sm:table-cell">Faculty</th>
              {columns.map((c) => (
                <th key={c.label} className={`py-2 pr-3 text-right font-medium ${c.className ?? ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => row(r, r.userId))}
            {meOutside && (
              <>
                <tr className="border-t border-line">
                  <td colSpan={3 + columns.length} className="py-1 text-center text-muted">
                    ⋯
                  </td>
                </tr>
                {row(board.me!, "me")}
              </>
            )}
          </tbody>
        </table>
      </div>
      {board.total > board.rows.length && (
        <p className="text-center text-xs text-muted">
          Showing the top {board.rows.length} of {board.total} players.
        </p>
      )}
    </div>
  );
}

function YourRank({ rank, total }: { rank: number; total: number }) {
  return (
    <p className="rounded-xl border border-gold bg-gold/10 px-3 py-2 text-sm">
      Your rank: <span className="font-bold">#{rank}</span>{" "}
      <span className="text-muted">of {total}</span>
    </p>
  );
}

export function DailyTable({ board, viewerId }: { board: Board<DailyRow>; viewerId: string | null }) {
  const game = board.rows[0] ? GAMES[board.rows[0].gameId as GameId] : undefined;
  return (
    <div className="space-y-2">
      {game && (
        <p className="text-sm">
          <span aria-hidden>{game.emoji}</span> <span className="font-semibold">{game.name}</span>
        </p>
      )}
      <PlayerTable
        board={board}
        viewerId={viewerId}
        empty="No finished games yet. Be the first on the board."
        columns={[
          { label: "Score", className: "text-muted", cell: (r) => formatScore(r.rawScore) },
          { label: "Pts", cell: (r) => r.points },
        ]}
      />
    </div>
  );
}

export function PeriodTable({ board, viewerId }: { board: Board<PeriodRow>; viewerId: string | null }) {
  return (
    <PlayerTable
      board={board}
      viewerId={viewerId}
      empty="Nobody has finished a game in this period yet."
      columns={[
        { label: "Days", className: "text-muted", cell: (r) => r.days },
        { label: "Pts", cell: (r) => r.points },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Faculty table
// ---------------------------------------------------------------------------

export function FacultyTable({ rows, viewerFaculty }: { rows: FacultyRow[]; viewerFaculty: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pl-3 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Faculty</th>
            <th className="py-2 pr-2 text-right font-medium" title="Players this period / members">
              Players
            </th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell" title="Average points per play">
              Avg
            </th>
            <th className="py-2 pr-3 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mine = r.faculty === viewerFaculty;
            return (
              <tr key={r.faculty} className={`border-t border-line ${mine ? "bg-gold/15 font-semibold" : ""}`}>
                <td className="py-2 pl-3 pr-2 tabular-nums text-muted">{r.players ? r.rank : "–"}</td>
                <td className="py-2 pr-2">
                  {facultyName(r.faculty)}
                  <div className="text-xs font-normal text-muted sm:hidden">avg {r.avgPoints}</div>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {r.players}
                  <span className="text-muted"> / {r.members}</span>
                </td>
                <td className="hidden py-2 pr-2 text-right tabular-nums text-muted sm:table-cell">
                  {r.avgPoints}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BoardNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{children}</p>;
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Fri, Nov 20" for a YYYY-MM-DD date. */
export function formatDay(date: string): string {
  return dayFmt.format(new Date(`${date}T00:00:00Z`));
}

/** "Nov 16 – Nov 20" for an inclusive date range. */
export function formatRange(from: string, to: string): string {
  return `${shortFmt.format(new Date(`${from}T00:00:00Z`))} – ${shortFmt.format(new Date(`${to}T00:00:00Z`))}`;
}
