"use client";

import { useState } from "react";
import type { GameProps } from "@/games/use-game";
import { getAudio } from "./audio";
import {
  TEST_LABELS,
  gradeFor,
  squareFor,
  type ActiveTest,
  type SharpMove,
  type SharpReveal,
  type SharpView,
  type TestName,
  type TestResult,
} from "./shared";
import { AngleTest } from "./tests/angle";
import { CountTest } from "./tests/count";
import { SplitTest } from "./tests/split";
import { TempoTest } from "./tests/tempo";
import { TrackTest } from "./tests/track";

const HOW: Record<TestName, string> = {
  count: "Dots flash for two seconds. Type how many you think there were.",
  track: "A ball is thrown and vanishes mid-flight. Mark where on the floor it will land.",
  angle: "Drag the arm counter-clockwise from the flat line to match the angle. Letting go locks it in.",
  tempo: "Hear four beats, then keep the same beat going in silence: tap eight times (Space or the pad).",
  split: "Place the marker at the given fraction of the line, measured from the arrow's end.",
};

export default function SharpGame({ snapshot, start, move, busy, error }: GameProps<SharpView, SharpMove>) {
  const view = snapshot.view;

  return (
    <div className="mx-auto max-w-[600px] space-y-5">
      {snapshot.status === "new" && <Intro onStart={start} busy={busy} />}
      {snapshot.status !== "new" && <Progress view={view} />}
      {snapshot.status === "playing" && <Playing view={view} move={move} busy={busy} />}
      {snapshot.status === "done" && <Finished date={snapshot.date} view={view} />}
      {error && (
        <p role="alert" className="rounded-lg border border-miss px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function Intro({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-card p-5">
      <h2 className="text-lg font-semibold">How to play</h2>
      <p className="text-muted">
        Five quick perception tests, one after another. Each is scored 0–100 by how close you get; your score is the
        average. You get one shot at each, and each starts only when you press Begin.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {(Object.keys(HOW) as TestName[]).map((t) => (
          <li key={t}>
            <span className="font-semibold">{TEST_LABELS[t]}</span> — {HOW[t]}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">Tempo uses sound, so turn your volume up.</p>
      <button
        onClick={onStart}
        disabled={busy}
        className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black disabled:opacity-50"
      >
        Start
      </button>
    </section>
  );
}

function Progress({ view }: { view: SharpView }) {
  return (
    <ol className="grid grid-cols-5 gap-2 text-center text-xs">
      {view.tests.map((t, i) => {
        const r = view.results[i];
        const current = view.total === null && i === view.nextIndex;
        return (
          <li
            key={t}
            className={`rounded-lg border px-1 py-2 ${current ? "border-gold" : "border-line"} ${r ? "bg-card" : ""}`}
          >
            <div className="font-semibold">{TEST_LABELS[t]}</div>
            <div className="tabular-nums text-muted">{r ? r.score : "–"}</div>
          </li>
        );
      })}
    </ol>
  );
}

function Playing({
  view,
  move,
  busy,
}: {
  view: SharpView;
  move: (m: SharpMove) => Promise<boolean>;
  busy: boolean;
}) {
  const test = view.tests[view.nextIndex];
  const last = view.results.at(-1);
  if (!test) return null;

  if (!view.active) {
    return (
      <div className="space-y-4">
        {last && <ResultCard result={last} />}
        <section className="space-y-3 rounded-xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">
            {view.nextIndex + 1}/5 · {TEST_LABELS[test]}
          </h2>
          <p className="text-muted">{HOW[test]}</p>
          <button
            autoFocus
            disabled={busy}
            onClick={() => {
              // Unlock audio inside the click so the beats can play.
              if (test === "tempo") getAudio();
              void move({ type: "begin" });
            }}
            className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black disabled:opacity-50"
          >
            Begin
          </button>
        </section>
      </div>
    );
  }

  return (
    <ActiveRunner
      // Remount for each test so internal state never leaks between tests.
      key={view.nextIndex}
      params={view.active}
      busy={busy}
      onAnswer={(value) => move({ type: "answer", value })}
    />
  );
}

function ActiveRunner({
  params,
  busy,
  onAnswer,
}: {
  params: ActiveTest;
  busy: boolean;
  onAnswer: (v: number | number[]) => Promise<boolean>;
}) {
  // One answer per test: ignore repeat submits while the request is in flight.
  const [sent, setSent] = useState(false);
  // Bumped when a submit fails, to reset the test component for another go.
  const [attempt, setAttempt] = useState(0);
  const answer = (v: number | number[]) => {
    if (sent) return;
    setSent(true);
    void onAnswer(v).then((ok) => {
      if (!ok) {
        setSent(false);
        setAttempt((a) => a + 1);
      }
    });
  };
  const props = { busy: busy || sent, onAnswer: answer };
  switch (params.test) {
    case "count":
      return <CountTest key={attempt} params={params} {...props} />;
    case "track":
      return <TrackTest key={attempt} params={params} {...props} />;
    case "angle":
      return <AngleTest key={attempt} params={params} {...props} />;
    case "tempo":
      return <TempoTest key={attempt} params={params} {...props} />;
    case "split":
      return <SplitTest key={attempt} params={params} {...props} />;
  }
}

function ResultCard({ result }: { result: TestResult }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-card p-4">
      <div className="text-3xl font-bold tabular-nums">{result.score}</div>
      <div>
        <div className="font-semibold">{TEST_LABELS[result.test]}</div>
        <div className="text-sm text-muted">{result.detail}</div>
      </div>
    </div>
  );
}

function revealLine(test: TestName, r: SharpReveal, answer: number | number[] | null): string {
  const a = typeof answer === "number" ? answer : null;
  switch (test) {
    case "count":
      return `${r.count} dots${a !== null ? ` · you said ${a}` : ""}`;
    case "track":
      return `Landed at ${r.trackLandingX}${a !== null ? ` · you marked ${Math.round(a)}` : ""}`;
    case "angle":
      return `${r.angleTarget}°${a !== null ? ` · you made ${a.toFixed(1)}°` : ""}`;
    case "tempo":
      return `Beat every ${r.tempoIntervalMs} ms`;
    case "split":
      return `${(r.splitTarget * 100).toFixed(1)}% from the left${a !== null ? ` · you marked ${(a * 100).toFixed(1)}%` : ""}`;
  }
}

function Finished({ date, view }: { date: string; view: SharpView }) {
  const [copied, setCopied] = useState(false);
  const total = view.total ?? 0;
  const grade = gradeFor(total);
  const share = `Wattle Sharp ${date} 🎯 ${total} (${grade})\n${view.results.map((r) => squareFor(r.score)).join("")}`;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gold bg-card p-5 text-center">
        <div className="text-sm text-muted">Your score</div>
        <div className="text-5xl font-bold tabular-nums">{total}</div>
        <div className="mt-1 text-lg font-semibold text-gold-deep">Grade {grade}</div>
      </div>
      <ul className="space-y-2">
        {view.results.map((res, i) => (
          <li key={res.test} className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {squareFor(res.score)} {TEST_LABELS[res.test]}
              </span>
              <span className="text-xl font-bold tabular-nums">{res.score}</span>
            </div>
            <div className="text-sm text-muted">{res.detail}</div>
            {view.reveal && <div className="text-sm">{revealLine(res.test, view.reveal, view.reveal.answers[i])}</div>}
          </li>
        ))}
      </ul>
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-card p-3 text-sm">{share}</pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(share);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-black"
      >
        {copied ? "Copied!" : "Copy result"}
      </button>
    </section>
  );
}
