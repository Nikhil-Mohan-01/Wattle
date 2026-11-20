import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { play } from "@/db/schema";
import { GAMES, SCHEDULE, WEEKDAYS } from "@/lib/games";
import { getCurrentUser } from "@/lib/session";
import { addDays, weekdayOf, weekStart } from "@/lib/time";
import { currentPuzzleDate } from "@/lib/today";
import { DeletedNotice } from "./deleted-notice";

type DayResult = { status: "playing" | "done"; rawScore: number | null };

export default function Home() {
  return (
    <div className="space-y-8">
      <Suspense>
        <DeletedNotice />
      </Suspense>
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">One game a day. One campus leaderboard.</h1>
        <p className="text-muted">
          A different daily game every weekday. Sign in with your Waterloo account, play once, and
          see how you stack up against the rest of campus.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            href="/play"
            className="rounded-lg bg-gold px-5 py-2.5 font-semibold text-black hover:opacity-90"
          >
            Play today&apos;s game
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-lg border border-line bg-card px-5 py-2.5 font-semibold hover:border-gold"
          >
            Leaderboard
          </Link>
        </div>
      </section>

      <Suspense fallback={<WeekSchedule today={null} />}>
        <TodaySchedule />
      </Suspense>
    </div>
  );
}

async function TodaySchedule() {
  // Today's date depends on the request time, so render it at request time.
  await connection();
  const date = currentPuzzleDate();
  const user = await getCurrentUser();

  // The signed-in player's own results for this week, keyed by weekday.
  const results = new Map<number, DayResult>();
  if (user) {
    const monday = weekStart(date);
    const rows = await db
      .select({ date: play.date, status: play.status, rawScore: play.rawScore })
      .from(play)
      .where(and(eq(play.userId, user.id), gte(play.date, monday), lte(play.date, addDays(monday, 4))));
    for (const r of rows) results.set(weekdayOf(r.date), { status: r.status, rawScore: r.rawScore });
  }
  return <WeekSchedule today={weekdayOf(date)} results={results} />;
}

function WeekSchedule({
  today,
  results = new Map(),
}: {
  today: number | null;
  results?: Map<number, DayResult>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">This week</h2>
      <ul className="grid gap-3">
        {WEEKDAYS.map(({ day, label }) => {
          const game = GAMES[SCHEDULE[day]!];
          const isToday = day === today;
          return (
            <li
              key={day}
              className={`flex items-center gap-4 rounded-xl border bg-card p-4 ${
                isToday ? "border-gold shadow-sm" : "border-line"
              }`}
            >
              <span className="w-10 text-sm font-semibold text-muted">{label}</span>
              <span className="text-2xl" aria-hidden>
                {game.emoji}
              </span>
              <div className="flex-1">
                <div className="font-semibold">
                  {game.name}
                  {isToday && (
                    <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-black">
                      TODAY
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted">{game.tagline}</div>
              </div>
              <ResultBadge result={results.get(day)} isToday={isToday} />
            </li>
          );
        })}
      </ul>
      {today !== null && SCHEDULE[today] === null && (
        <p className="text-sm text-muted">No game on weekends. See you Monday.</p>
      )}
    </section>
  );
}

function ResultBadge({ result, isToday }: { result?: DayResult; isToday: boolean }) {
  if (result?.status === "done") {
    return (
      <span className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold">
        ✓ {result.rawScore ?? 0}
      </span>
    );
  }
  if (result?.status === "playing") {
    return <span className="text-xs font-semibold text-gold-deep">In progress</span>;
  }
  if (isToday) {
    return (
      <Link href="/play" className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-black">
        Play
      </Link>
    );
  }
  return null;
}
