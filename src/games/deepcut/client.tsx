"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GameProps } from "../use-game";
import {
  MAX_ATTEMPTS,
  TIER_LABELS,
  TIER_POINTS,
  type DeepCutMove,
  type DeepCutResultView,
  type DeepCutView,
  type Tier,
} from "./types";

// Tier colours read in light and dark themes; each chip also prints its label,
// so colour is never the only signal.
const TIER_STYLE: Record<Tier, { chip: string; square: string }> = {
  1: { chip: "bg-line text-foreground", square: "⬜" },
  2: { chip: "bg-[#3f9b5a] text-white", square: "🟩" },
  3: { chip: "bg-[#2f7fc1] text-white", square: "🟦" },
  4: { chip: "bg-[#6a4fc4] text-white", square: "🟪" },
  5: { chip: "bg-gold text-[#16140f]", square: "🟨" },
};
const MISS = { chip: "bg-miss text-white", square: "⬛" };

const SHAKE_CSS = `@keyframes dc-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.dc-shake{animation:dc-shake .35s ease-in-out}`;

export default function DeepCutClient({ snapshot, start, move, busy, error }: GameProps<DeepCutView, DeepCutMove>) {
  const { view, status } = snapshot;

  if (status === "new") {
    return (
      <div className="mx-auto max-w-[600px] space-y-4 rounded-xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">How to play</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>{view.count} prompts, like &ldquo;Name a planet&rdquo;. Type one correct answer for each.</li>
          <li>You have {view.timeLimitMs / 1000} seconds per prompt and up to {MAX_ATTEMPTS} tries. Wrong tries cost nothing.</li>
          <li>
            Rarer answers score more: {([1, 2, 3, 4, 5] as Tier[]).map((t) => TIER_POINTS[t]).join(" / ")} points from
            common to deep cut.
          </li>
          <li>The clock starts as soon as you press Start.</li>
        </ul>
        <button
          onClick={async () => {
            await start();
            await move({ type: "begin" });
          }}
          disabled={busy}
          className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-[#16140f] disabled:opacity-50"
        >
          Start
        </button>
        {error && <ErrorText message={error} />}
      </div>
    );
  }

  if (view.phase === "ready") {
    return (
      <div className="mx-auto max-w-[600px] space-y-4 rounded-xl border border-line bg-card p-5 text-center">
        <p className="text-muted">Ready when you are. The first prompt appears when you press Begin.</p>
        <button
          onClick={() => void move({ type: "begin" })}
          disabled={busy}
          className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-[#16140f] disabled:opacity-50"
        >
          Begin
        </button>
        {error && <ErrorText message={error} />}
      </div>
    );
  }

  if (status === "done" || !view.current) {
    return <Finished view={view} date={snapshot.date} score={snapshot.rawScore ?? view.total} error={error} />;
  }

  return <Playing view={view} current={view.current} move={move} busy={busy} error={error} />;
}

function Playing({
  view,
  current,
  move,
  busy,
  error,
}: {
  view: DeepCutView;
  current: NonNullable<DeepCutView["current"]>;
  move: (m: DeepCutMove) => Promise<boolean>;
  busy: boolean;
  error: string | null;
}) {
  const [text, setText] = useState("");
  // Server clock minus browser clock, estimated from the latest response.
  // Lag makes the bar run slightly behind the server; the server's grace covers it.
  const [offset, setOffset] = useState(() => current.serverNow - Date.now());
  const [clientNow, setClientNow] = useState(() => Date.now());
  const timeoutSent = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffset(current.serverNow - Date.now());
  }, [current.serverNow]);

  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, current.deadline - (clientNow + offset));
  const fraction = remainingMs / view.timeLimitMs;

  // Tell the server when time runs out. It re-checks the deadline itself.
  useEffect(() => {
    if (remainingMs > 0 || busy || timeoutSent.current === view.index) return;
    timeoutSent.current = view.index;
    void move({ type: "timeout" }).then((ok) => {
      if (ok) setText("");
      else timeoutSent.current = -1; // Retry on the next tick (e.g. after a conflict).
    });
  }, [remainingMs, busy, view.index, move]);

  // Keep focus in the box as prompts change.
  useEffect(() => {
    inputRef.current?.focus();
  }, [view.index]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const answer = text.trim();
    if (!answer || busy || remainingMs <= 0) return;
    if (await move({ type: "answer", text: answer })) setText("");
    inputRef.current?.focus();
  };

  const lastWrong = current.wrong.at(-1);
  const barColour = remainingMs > 8000 ? "bg-good" : remainingMs > 4000 ? "bg-near" : "bg-red-500";

  return (
    <div className="mx-auto max-w-[600px] space-y-5">
      <style>{SHAKE_CSS}</style>
      <div className="flex items-baseline justify-between text-sm text-muted">
        <span>
          Prompt {view.index + 1} of {view.count}
        </span>
        <span className="font-semibold text-foreground">{view.total} pts</span>
      </div>

      <div className="space-y-2">
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Time left"
          aria-valuemin={0}
          aria-valuemax={view.timeLimitMs / 1000}
          aria-valuenow={Math.ceil(remainingMs / 1000)}
        >
          <div className={`h-full ${barColour} transition-[width] duration-100 ease-linear`} style={{ width: `${fraction * 100}%` }} />
        </div>
        <p className="text-right text-xs tabular-nums text-muted">{(remainingMs / 1000).toFixed(1)}s</p>
      </div>

      <h2 className="text-center text-2xl font-bold leading-tight sm:text-3xl">{current.prompt}</h2>

      <form onSubmit={submit} className="space-y-2">
        <div key={`${view.index}:${current.wrong.length}`} className={current.wrong.length ? "dc-shake" : ""}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={60}
            enterKeyHint="send"
            aria-label="Your answer"
            placeholder="Type an answer and press Enter"
            className={`w-full rounded-lg border bg-card px-4 py-3 text-lg outline-none focus:border-foreground ${
              lastWrong ? "border-red-400" : "border-line"
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !text.trim() || remainingMs <= 0}
          className="w-full rounded-lg bg-foreground px-4 py-3 font-semibold text-background disabled:opacity-40"
        >
          Submit
        </button>
      </form>

      <p className="min-h-5 text-center text-sm" aria-live="polite">
        {lastWrong ? (
          <>
            <span className="font-medium">&ldquo;{lastWrong}&rdquo; isn&apos;t on the list.</span>{" "}
            <span className="text-muted">
              {current.attemptsLeft} {current.attemptsLeft === 1 ? "try" : "tries"} left
            </span>
          </>
        ) : null}
      </p>
      {current.wrong.length > 1 && (
        <p className="text-center text-xs text-muted">Tried: {current.wrong.join(", ")}</p>
      )}
      {error && <ErrorText message={error} />}

      {view.results.length > 0 && (
        <ul className="space-y-1.5">
          {view.results.map((r, i) => (
            <ResultRow key={i} result={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Finished({ view, date, score, error }: { view: DeepCutView; date: string; score: number; error: string | null }) {
  const [copied, setCopied] = useState(false);
  const squares = view.results.map((r) => (r.tier ? TIER_STYLE[r.tier].square : MISS.square)).join("");
  const share = `Wattle Deep Cut ${date} 🪸 ${score} pts\n${squares}`;

  return (
    <div className="mx-auto max-w-[600px] space-y-5">
      <div className="rounded-xl border border-line bg-card p-5 text-center">
        <p className="text-sm text-muted">Final score</p>
        <p className="text-4xl font-bold">{score}</p>
        <p className="text-sm text-muted">out of {view.count * TIER_POINTS[5]}</p>
        <p className="mt-3 text-2xl tracking-widest" aria-hidden>
          {squares}
        </p>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(share);
            setCopied(true);
          }}
          className="mt-3 rounded-full bg-gold px-5 py-2 text-sm font-semibold text-[#16140f]"
        >
          {copied ? "Copied!" : "Copy result"}
        </button>
      </div>
      {error && <ErrorText message={error} />}

      <ol className="space-y-3">
        {view.results.map((r, i) => {
          const reveal = view.reveal?.[i];
          return (
            <li key={i} className="space-y-2 rounded-xl border border-line bg-card p-4">
              <ResultRow result={r} />
              {reveal && (
                <div className="space-y-1 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Deepest cuts · {reveal.answerCount} answers on the list
                  </p>
                  {reveal.examples.map((e) => (
                    <p key={e.tier}>
                      <TierChip tier={e.tier} /> <span className="text-muted">{e.answers.join(", ")}</span>
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResultRow({ result: r }: { result: DeepCutResultView }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="truncate text-muted">{r.prompt}</p>
        <p className="font-semibold">
          {r.outcome === "correct" ? r.answer : r.outcome === "timeout" ? "Out of time" : "Out of tries"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {r.tier ? (
          <TierChip tier={r.tier} />
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MISS.chip}`}>Miss</span>
        )}
        <span className="w-14 text-right font-semibold tabular-nums">+{r.points}</span>
      </div>
    </div>
  );
}

function TierChip({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[tier].chip}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm">{message}</p>;
}
