"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameProps } from "../use-game";
import type { Difficulty, QuadsGroup, QuadsMove, QuadsView } from "./types";

// Four distinct colours, readable in light and dark themes. Each solved row
// also prints its difficulty in words, so colour is never the only signal.
const LEVELS: Record<Difficulty, { label: string; className: string; square: string }> = {
  1: { label: "Easy", className: "bg-[#e4b429] text-[#16140f]", square: "🟨" },
  2: { label: "Medium", className: "bg-[#3f9b5a] text-white", square: "🟩" },
  3: { label: "Tricky", className: "bg-[#d9692b] text-white", square: "🟧" },
  4: { label: "Devious", className: "bg-[#6a4fc4] text-white", square: "🟪" },
};

const RESULT_TEXT = {
  correct: "Nice, that's a group!",
  one_away: "One away…",
  wrong: "Not a group.",
} as const;

export default function QuadsClient({ snapshot, start, move, busy, error }: GameProps<QuadsView, QuadsMove>) {
  const { view, status } = snapshot;
  const [selected, setSelected] = useState<string[]>([]);
  // A local shuffle only; the server's order is the canonical one.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  // Keep the local order in step with the server's remaining tiles.
  const tiles = useMemo(() => {
    if (!localOrder) return view.tiles;
    const remaining = new Set(view.tiles);
    const kept = localOrder.filter((w) => remaining.has(w));
    return kept.length === view.tiles.length ? kept : view.tiles;
  }, [localOrder, view.tiles]);

  // Drop selections that are no longer on the board (e.g. after a correct guess).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected((sel) => sel.filter((w) => view.tiles.includes(w)));
  }, [view.tiles]);

  if (status === "new") {
    return (
      <div className="space-y-4 rounded-xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">How to play</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Sixteen words hide four groups of four that share something.</li>
          <li>Pick four words and submit. A right group locks in.</li>
          <li>You can make {view.maxMistakes} mistakes. &ldquo;One away&rdquo; means three of your four belong together.</li>
          <li>Groups range from easy to devious. Watch out for red herrings.</li>
        </ul>
        <button
          onClick={() => void start()}
          disabled={busy}
          className="w-full rounded-lg bg-gold px-4 py-3 font-semibold text-[#16140f] disabled:opacity-50"
        >
          Start
        </button>
        {error && <ErrorText message={error} />}
      </div>
    );
  }

  const done = status === "done";
  const toggle = (w: string) =>
    setSelected((sel) => (sel.includes(w) ? sel.filter((x) => x !== w) : sel.length < 4 ? [...sel, w] : sel));

  const repeat =
    selected.length === 4 &&
    view.wrongGuesses.some((g) => g.length === 4 && g.every((w) => selected.includes(w)));

  const submit = async () => {
    if (selected.length !== 4 || busy || repeat) return;
    await move({ words: selected });
  };

  const shuffle = () => {
    const out = [...tiles];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    setLocalOrder(out);
  };

  const share = [`Wattle Quads ${snapshot.date}`, ...(view.history ?? []).map((row) => row.map((d) => LEVELS[d].square).join(""))].join("\n");

  return (
    <div className="mx-auto max-w-[600px] space-y-4">
      <div className="space-y-2">
        {(done ? orderedGroups(view) : view.solved).map((g) => (
          <SolvedRow key={g.difficulty} group={g} found={view.solved.some((s) => s.difficulty === g.difficulty)} />
        ))}
      </div>

      {!done && (
        <>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Word tiles">
            {tiles.map((w) => {
              const on = selected.includes(w);
              return (
                <button
                  key={w}
                  onClick={() => toggle(w)}
                  aria-pressed={on}
                  disabled={busy}
                  className={`flex h-16 items-center justify-center rounded-lg border px-1 text-center text-[11px] font-bold uppercase break-all transition-colors sm:h-20 sm:text-sm ${
                    on ? "border-foreground bg-foreground text-background" : "border-line bg-card hover:border-muted"
                  }`}
                >
                  {w}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted" aria-label={`${view.mistakesLeft} mistakes left`}>
            Mistakes left:
            {Array.from({ length: view.maxMistakes }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={`inline-block h-3 w-3 rounded-full ${i < view.mistakesLeft ? "bg-foreground" : "bg-line"}`}
              />
            ))}
          </div>

          <p className="min-h-5 text-center text-sm font-medium" aria-live="polite">
            {repeat ? "You've already tried that group." : view.lastResult ? RESULT_TEXT[view.lastResult] : ""}
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={shuffle} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50">
              Shuffle
            </button>
            <button
              onClick={() => setSelected([])}
              disabled={busy || selected.length === 0}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Deselect all
            </button>
            <button
              onClick={() => void submit()}
              disabled={busy || selected.length !== 4 || repeat}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </>
      )}

      {done && (
        <div className="space-y-3 rounded-xl border border-line bg-card p-5 text-center">
          <p className="text-lg font-semibold">
            {view.won ? "All four groups found!" : `Out of mistakes: ${view.solved.length} of 4 groups found.`}
          </p>
          <p className="text-sm text-muted">Mistakes: {view.maxMistakes - view.mistakesLeft} · Score: {snapshot.rawScore ?? "–"} / 100</p>
          <pre className="font-sans text-lg leading-tight">{share}</pre>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(share);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="rounded-lg bg-gold px-4 py-2 font-semibold text-[#16140f]"
          >
            {copied ? "Copied!" : "Copy result"}
          </button>
        </div>
      )}

      {error && <ErrorText message={error} />}
    </div>
  );
}

/** When done: found groups first (in the order found), then the rest easiest first. */
function orderedGroups(view: QuadsView): QuadsGroup[] {
  const found = new Set(view.solved.map((g) => g.difficulty));
  return [...view.solved, ...(view.groups ?? []).filter((g) => !found.has(g.difficulty))];
}

function SolvedRow({ group, found }: { group: QuadsGroup; found: boolean }) {
  const level = LEVELS[group.difficulty];
  return (
    <div className={`rounded-lg px-3 py-3 text-center ${level.className} ${found ? "" : "opacity-70"}`}>
      <p className="text-sm font-bold uppercase">
        {group.category}
        <span className="ml-2 text-xs font-medium normal-case opacity-80">
          ({level.label}
          {found ? "" : ", missed"})
        </span>
      </p>
      <p className="text-sm uppercase">{group.words.join(", ")}</p>
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-center text-sm text-red-600">
      {message}
    </p>
  );
}
