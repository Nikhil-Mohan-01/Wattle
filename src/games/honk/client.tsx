"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameProps } from "@/games/use-game";
import { MAX_GUESSES, WORD_LENGTH, type HonkMove, type HonkView, type Mark } from "./feedback";

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const RANK: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
const EMOJI: Record<Mark, string> = { correct: "🟩", present: "🟨", absent: "⬛" };

const TILE: Record<Mark, string> = {
  correct: "bg-good border-good text-white",
  present: "bg-near border-near text-white",
  absent: "bg-miss border-miss text-white",
};

export default function HonkClient({ snapshot, start, move, busy, error }: GameProps<HonkView, HonkMove>) {
  const { status, view, date } = snapshot;
  const [draft, setDraft] = useState("");
  const [shake, setShake] = useState(false);
  const [copied, setCopied] = useState(false);

  // Best known status per letter, for colouring the keyboard.
  const letterStatus = useMemo(() => {
    const best = new Map<string, Mark>();
    for (const row of view.rows) {
      row.marks.forEach((m, i) => {
        const prev = best.get(row.word[i]);
        if (!prev || RANK[m] > RANK[prev]) best.set(row.word[i], m);
      });
    }
    return best;
  }, [view.rows]);

  const playing = status === "playing";

  const submit = useCallback(async () => {
    if (busy) return;
    if (draft.length !== WORD_LENGTH) {
      setShake(true);
      return;
    }
    const ok = await move({ guess: draft });
    if (ok) setDraft("");
    else setShake(true);
  }, [busy, draft, move]);

  const press = useCallback(
    (key: string) => {
      if (!playing || busy) return;
      if (key === "enter") void submit();
      else if (key === "back") setDraft((d) => d.slice(0, -1));
      else if (/^[a-z]$/.test(key)) setDraft((d) => (d.length < WORD_LENGTH ? d + key : d));
    },
    [playing, busy, submit],
  );

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Enter") press("enter");
      else if (e.key === "Backspace") press("back");
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, press]);

  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [shake]);

  if (status === "new") {
    return (
      <div className="mx-auto max-w-[600px] rounded-xl border border-line bg-card p-6">
        <h2 className="text-xl font-semibold">How to play</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Guess the hidden five-letter word in six tries.</li>
          <li>
            After each guess, tiles turn <span className="font-semibold text-good">green</span> for the right
            letter in the right spot, <span className="font-semibold text-near">yellow</span> for a letter
            that&apos;s elsewhere in the word, and <span className="font-semibold text-muted">grey</span> if
            it isn&apos;t in the word.
          </li>
          <li>Guesses must be real words. Fewer guesses means a higher score.</li>
        </ul>
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="mt-5 rounded-lg bg-gold px-5 py-2 font-semibold text-black hover:bg-gold-deep disabled:opacity-50"
        >
          Start
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const done = status === "done";
  const n = view.rows.length;
  const share = done
    ? [
        `Wattle Honk ${date} ${view.solved ? n : "X"}/${MAX_GUESSES}`,
        ...view.rows.map((r) => r.marks.map((m) => EMOJI[m]).join("")),
      ].join("\n")
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[600px] flex-col items-center gap-4">
      <style>{`@keyframes honk-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>

      <div className="grid gap-1.5" role="grid" aria-label="Guesses">
        {Array.from({ length: MAX_GUESSES }, (_, r) => {
          const row = view.rows[r];
          const isDraft = !row && r === n && playing;
          const letters = row ? row.word : isDraft ? draft : "";
          return (
            <div
              key={r}
              role="row"
              className="grid grid-cols-5 gap-1.5"
              style={isDraft && shake ? { animation: "honk-shake 0.45s" } : undefined}
            >
              {Array.from({ length: WORD_LENGTH }, (_, c) => {
                const ch = letters[c] ?? "";
                const mark = row?.marks[c];
                const cls = mark
                  ? TILE[mark]
                  : ch
                    ? `border-muted ${isDraft && shake ? "bg-red-500/20" : "bg-card"}`
                    : "border-line bg-card";
                return (
                  <div
                    key={c}
                    role="gridcell"
                    aria-label={ch ? `${ch.toUpperCase()}${mark ? ` ${mark}` : ""}` : "empty"}
                    className={`flex h-12 w-12 items-center justify-center border-2 text-2xl font-bold uppercase sm:h-14 sm:w-14 ${cls}`}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {done && (
        <div className="w-full rounded-xl border border-line bg-card p-4 text-center">
          <p className="text-lg font-semibold">
            {view.solved ? `Solved in ${n}/${MAX_GUESSES}!` : "Out of guesses."}
          </p>
          <p className="mt-1 text-sm text-muted">
            The word was <span className="font-bold uppercase text-foreground">{view.answer}</span>
          </p>
          <p className="mt-1 text-sm">
            Score: <span className="font-semibold">{snapshot.rawScore ?? 0}</span>
          </p>
          <pre className="mt-3 font-sans text-sm leading-tight">{share}</pre>
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-3 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black hover:bg-gold-deep"
          >
            {copied ? "Copied!" : "Copy result"}
          </button>
        </div>
      )}

      {playing && (
        <div className="flex w-full flex-col gap-1.5" aria-label="Keyboard">
          {KEY_ROWS.map((keys, i) => (
            <div key={keys} className="flex justify-center gap-1">
              {i === 2 && (
                <Key label="Enter" wide onClick={() => press("enter")} disabled={busy} />
              )}
              {keys.split("").map((k) => (
                <Key key={k} label={k} mark={letterStatus.get(k)} onClick={() => press(k)} disabled={busy} />
              ))}
              {i === 2 && <Key label="⌫" aria="Backspace" wide onClick={() => press("back")} disabled={busy} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Key({
  label,
  mark,
  wide,
  aria,
  onClick,
  disabled,
}: {
  label: string;
  mark?: Mark;
  wide?: boolean;
  aria?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colour = mark ? TILE[mark] : "bg-line text-foreground border-line";
  return (
    <button
      type="button"
      aria-label={aria ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`h-12 rounded-md border text-sm font-semibold uppercase disabled:opacity-60 ${
        wide ? "min-w-[3.25rem] px-2 text-xs" : "w-8 sm:w-10"
      } ${colour}`}
    >
      {label}
    </button>
  );
}
