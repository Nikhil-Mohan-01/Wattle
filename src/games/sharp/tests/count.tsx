"use client";

import { useEffect, useState } from "react";
import { COUNT_BOX, COUNT_DOT_R, type ActiveTest } from "../shared";
import type { TestProps } from "./common";

type Params = Extract<ActiveTest, { test: "count" }>;

export function CountTest({ params, busy, onAnswer }: TestProps<Params>) {
  const [shown, setShown] = useState(Boolean(params.dots) && params.showMsLeft > 0);
  const [guess, setGuess] = useState("");

  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => setShown(false), params.showMsLeft);
    return () => window.clearTimeout(id);
  }, [shown, params.showMsLeft]);

  const n = Number(guess);
  const valid = guess !== "" && Number.isInteger(n) && n >= 0 && n <= 1000;

  return (
    <div className="space-y-4">
      <svg
        viewBox={`0 0 ${COUNT_BOX.w} ${COUNT_BOX.h}`}
        className="w-full rounded-xl border border-line bg-card"
        role="img"
        aria-label={shown ? "A field of dots" : "The dots are hidden"}
      >
        {shown &&
          params.dots?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={COUNT_DOT_R} className="fill-gold" />)}
        {!shown && (
          <text x={COUNT_BOX.w / 2} y={COUNT_BOX.h / 2} textAnchor="middle" className="fill-muted text-[40px]">
            How many?
          </text>
        )}
      </svg>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !shown) onAnswer(n);
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          value={guess}
          disabled={shown || busy}
          // Focus the box as soon as the dots disappear.
          ref={(el) => {
            if (el && !shown) el.focus();
          }}
          onChange={(e) => setGuess(e.target.value)}
          placeholder={shown ? "Look…" : "Your count"}
          aria-label="Number of dots"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-lg"
        />
        <button
          type="submit"
          disabled={!valid || shown || busy}
          className="rounded-lg bg-gold px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          Lock in
        </button>
      </form>
    </div>
  );
}
