import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  FACULTY_FULL_STRENGTH,
  UNIVERSITY_FULL_STRENGTH,
  dailyBoard,
  facultyBoard,
  latestGameDay,
  periodBoard,
  termOf,
  universityBoard,
  weekRange,
} from "@/engine/leaderboard";
import { getCurrentUser } from "@/lib/session";
import { addDays, weekStart } from "@/lib/time";
import { currentPuzzleDate, isValidDate } from "@/lib/today";
import { enabledUniversities, universityById } from "@/lib/universities";
import {
  BoardNote,
  DailyTable,
  FacultyTable,
  PeriodTable,
  ScopeChips,
  TABS,
  Tabs,
  UniversityTable,
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
          Each day you earn 0–100 points for where you finish among everyone who played, at every
          university. Points add up over the week and the term.
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
  const viewerUni = viewer?.university ?? null;
  const universities = enabledUniversities();

  // "Today" depends on the request time, so mark this as request-time work
  // before reading the clock.
  await connection();
  const today = currentPuzzleDate();
  const thisWeek = weekStart(today);
  const week = parseWeek(params.week, thisWeek);
  const weekParam = week === thisWeek ? null : week;

  // Player boards default to everyone; the faculty board needs one university.
  const uniParam = parseUni(params.uni);
  const scope = tab === "faculty" ? (uniParam ?? viewerUni ?? universities[0]?.id ?? null) : uniParam;

  return (
    <div className="space-y-5">
      <Tabs active={tab} week={weekParam} uni={uniParam} />
      {tab !== "universities" && (
        <ScopeChips
          tab={tab}
          week={weekParam}
          selected={scope}
          universities={universities}
          viewerUniversity={viewerUni}
          allowAll={tab !== "faculty"}
        />
      )}

      {tab === "today" && <TodayBoard today={today} viewerId={viewerId} scope={scope} />}

      {tab === "week" && (
        <section className="space-y-3">
          <WeekNav tab="week" week={week} thisWeek={thisWeek} label={weekLabel(week, thisWeek)} uni={scope} />
          <PeriodTable board={await periodBoard(weekRange(week), viewerId, scope)} viewerId={viewerId} />
        </section>
      )}

      {tab === "term" && <TermBoard today={today} viewerId={viewerId} scope={scope} />}

      {tab === "universities" && (
        <UniversityBoards week={week} thisWeek={thisWeek} today={today} viewerUni={viewerUni} />
      )}

      {tab === "faculty" && scope && (
        <FacultyBoards
          week={week}
          thisWeek={thisWeek}
          today={today}
          universityId={scope}
          viewerFaculty={scope === viewerUni ? (viewer?.faculty ?? null) : null}
        />
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

async function TodayBoard({ today, viewerId, scope }: { today: string; viewerId: string | null; scope: string | null }) {
  // On weekends there's no game, so show the most recent day that had one.
  const day = latestGameDay(today);
  const board = await dailyBoard(day, viewerId, scope);
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

async function TermBoard({ today, viewerId, scope }: { today: string; viewerId: string | null; scope: string | null }) {
  const term = termOf(today);
  const board = await periodBoard(term, viewerId, scope);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {term.name} <span className="font-normal normal-case">· {formatRange(term.from, term.to)}</span>
      </h2>
      <PeriodTable board={board} viewerId={viewerId} />
    </section>
  );
}

async function UniversityBoards({
  week,
  thisWeek,
  today,
  viewerUni,
}: {
  week: string;
  thisWeek: string;
  today: string;
  viewerUni: string | null;
}) {
  const term = termOf(today);
  const [weekRows, termRows] = await Promise.all([universityBoard(weekRange(week)), universityBoard(term)]);
  const leader = weekRows[0]?.players ? universityById(weekRows[0].university) : undefined;
  return (
    <div className="space-y-8">
      {leader && (
        <p className="rounded-xl border border-gold bg-gold/10 p-4 text-center text-sm">
          🏆 <span className="font-semibold">{leader.name}</span> {week === thisWeek ? "leads" : "won"}{" "}
          {weekLabel(week, thisWeek).toLowerCase()}.
        </p>
      )}
      <section className="space-y-3">
        <WeekNav tab="universities" week={week} thisWeek={thisWeek} label={weekLabel(week, thisWeek)} />
        <UniversityTable rows={weekRows} viewerUniversity={viewerUni} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{term.name}</h2>
        <UniversityTable rows={termRows} viewerUniversity={viewerUni} />
      </section>
      <BoardNote>
        University score = average points per play × min(1, players ÷ {UNIVERSITY_FULL_STRENGTH}). A
        campus needs at least {UNIVERSITY_FULL_STRENGTH} active players for its average to count in
        full, so bring your friends.
      </BoardNote>
    </div>
  );
}

async function FacultyBoards({
  week,
  thisWeek,
  today,
  universityId,
  viewerFaculty,
}: {
  week: string;
  thisWeek: string;
  today: string;
  universityId: string;
  viewerFaculty: string | null;
}) {
  const term = termOf(today);
  const [weekRows, termRows] = await Promise.all([
    facultyBoard(weekRange(week), universityId),
    facultyBoard(term, universityId),
  ]);
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">Faculties at {universityById(universityId)?.name}.</p>
      <section className="space-y-3">
        <WeekNav
          tab="faculty"
          week={week}
          thisWeek={thisWeek}
          label={weekLabel(week, thisWeek)}
          uni={universityId}
        />
        <FacultyTable rows={weekRows} universityId={universityId} viewerFaculty={viewerFaculty} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{term.name}</h2>
        <FacultyTable rows={termRows} universityId={universityId} viewerFaculty={viewerFaculty} />
      </section>
      <BoardNote>
        Faculty score = average points per play × min(1, players ÷ {FACULTY_FULL_STRENGTH}). A faculty
        needs at least {FACULTY_FULL_STRENGTH} active players for its average to count in full.
      </BoardNote>
    </div>
  );
}

function parseTab(value: unknown): Tab {
  return TABS.some((t) => t.id === value) ? (value as Tab) : "today";
}

/** An enabled university id, or null for "all". */
function parseUni(value: unknown): string | null {
  return typeof value === "string" && enabledUniversities().some((u) => u.id === value) ? value : null;
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
