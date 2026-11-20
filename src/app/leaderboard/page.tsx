import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  dailyBoard,
  facultyBoard,
  latestGameDay,
  periodBoard,
  termOf,
  weekRange,
} from "@/engine/leaderboard";
import { getCurrentUser } from "@/lib/session";
import { addDays, weekStart } from "@/lib/time";
import { currentPuzzleDate, isValidDate } from "@/lib/today";
import {
  BoardNote,
  DailyTable,
  FacultyTable,
  PeriodTable,
  TABS,
  Tabs,
  WeekNav,
  formatDay,
  formatRange,
  type Tab,
} from "./components";

export const metadata: Metadata = {
  title: "Leaderboard — Wattle",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted">
          Each day you earn 0–100 points for where you finish among everyone who played. Points add
          up over the week and the term.
        </p>
      </header>
      {/* The tab comes from the URL and the highlighted row from the session, so
          everything below renders at request time. */}
      <Suspense fallback={<p className="text-muted">Loading leaderboard…</p>}>
        <Leaderboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Leaderboard({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;

  // "Today" depends on the request time, so mark this as request-time work
  // before reading the clock.
  await connection();
  const today = currentPuzzleDate();
  const thisWeek = weekStart(today);
  const week = parseWeek(params.week, thisWeek);

  return (
    <div className="space-y-5">
      <Tabs active={tab} week={week === thisWeek ? null : week} />

      {tab === "today" && <TodayBoard today={today} viewerId={viewerId} />}

      {tab === "week" && (
        <section className="space-y-3">
          <WeekNav tab="week" week={week} thisWeek={thisWeek} label={weekLabel(week, thisWeek)} />
          <PeriodTable board={await periodBoard(weekRange(week), viewerId)} viewerId={viewerId} />
        </section>
      )}

      {tab === "term" && <TermBoard today={today} viewerId={viewerId} />}

      {tab === "faculty" && (
        <FacultyBoards week={week} thisWeek={thisWeek} today={today} viewerFaculty={viewer?.faculty ?? null} />
      )}

      {!viewer && (
        <BoardNote>
          <Link href="/sign-in" className="font-semibold text-gold-deep underline">
            Sign in
          </Link>{" "}
          to play and see your own rank.
        </BoardNote>
      )}
    </div>
  );
}

async function TodayBoard({ today, viewerId }: { today: string; viewerId: string | null }) {
  // On weekends there's no game, so show the most recent day that had one.
  const day = latestGameDay(today);
  const board = await dailyBoard(day, viewerId);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {day === today ? "Today" : formatDay(day)}
        {day === today && <span className="font-normal normal-case"> · live</span>}
      </h2>
      <DailyTable board={board} viewerId={viewerId} />
    </section>
  );
}

async function TermBoard({ today, viewerId }: { today: string; viewerId: string | null }) {
  const term = termOf(today);
  const board = await periodBoard(term, viewerId);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {term.name} <span className="font-normal normal-case">· {formatRange(term.from, term.to)}</span>
      </h2>
      <PeriodTable board={board} viewerId={viewerId} />
    </section>
  );
}

async function FacultyBoards({
  week,
  thisWeek,
  today,
  viewerFaculty,
}: {
  week: string;
  thisWeek: string;
  today: string;
  viewerFaculty: string | null;
}) {
  const term = termOf(today);
  const [weekRows, termRows] = await Promise.all([
    facultyBoard(weekRange(week)),
    facultyBoard(term),
  ]);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <WeekNav tab="faculty" week={week} thisWeek={thisWeek} label={weekLabel(week, thisWeek)} />
        <FacultyTable rows={weekRows} viewerFaculty={viewerFaculty} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{term.name}</h2>
        <FacultyTable rows={termRows} viewerFaculty={viewerFaculty} />
      </section>
      <BoardNote>
        Faculty score = average points per play × min(1, players ÷ 10). A faculty needs at least 10
        active players for its average to count in full.
      </BoardNote>
    </div>
  );
}

function parseTab(value: unknown): Tab {
  return TABS.some((t) => t.id === value) ? (value as Tab) : "today";
}

/** A Monday no later than this week; anything else falls back to this week. */
function parseWeek(value: unknown, thisWeek: string): string {
  if (!isValidDate(value)) return thisWeek;
  const monday = weekStart(value);
  if (Number.isNaN(Date.parse(monday)) || monday > thisWeek) return thisWeek;
  return monday;
}

function weekLabel(week: string, thisWeek: string): string {
  if (week === thisWeek) return "This week";
  if (week === addDays(thisWeek, -7)) return "Last week";
  return `Week of ${formatDay(week)}`;
}
