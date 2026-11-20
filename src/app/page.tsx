import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { GAMES, SCHEDULE, WEEKDAYS } from "@/lib/games";
import { puzzleDate, weekdayOf } from "@/lib/time";

export default function Home() {
  return (
    <div className="space-y-8">
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
  return <WeekSchedule today={weekdayOf(puzzleDate())} />;
}

function WeekSchedule({ today }: { today: number | null }) {
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
