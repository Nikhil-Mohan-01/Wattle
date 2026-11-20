"use client";

import { useState } from "react";
import type { ActiveTest } from "../shared";
import { LockButton, clamp, svgPoint, type TestProps } from "./common";

type Params = Extract<ActiveTest, { test: "split" }>;

const W = 1000;
const H = 140;
const X0 = 50;
const X1 = 950;
const Y = 80;

export function SplitTest({ params, busy, onAnswer }: TestProps<Params>) {
  // Position as a fraction from the left end.
  const [pos, setPos] = useState<number | null>(null);
  const fromX = (x: number) => clamp((x - X0) / (X1 - X0), 0, 1);
  const submit = () => {
    if (pos !== null && !busy) onAnswer(Math.round(pos * 10000) / 10000);
  };
  const mx = pos === null ? null : X0 + pos * (X1 - X0);
  const fromLeft = params.from === "left";

  return (
    <div className="space-y-4">
      <p className="text-center text-xl">
        Mark{" "}
        <span className="font-bold">
          {params.num}/{params.den}
        </span>{" "}
        from the <span className="font-bold">{params.from}</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none rounded-xl border border-line bg-card outline-none focus-visible:ring-2 focus-visible:ring-gold"
        tabIndex={0}
        role="slider"
        aria-label={`Marker position. Arrow keys move it, Enter locks in.`}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setPos(fromX(svgPoint(e, W, H).x));
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 0) setPos(fromX(svgPoint(e, W, H).x));
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.005;
          if (e.key === "ArrowLeft") setPos((p) => clamp((p ?? 0.5) - step, 0, 1));
          else if (e.key === "ArrowRight") setPos((p) => clamp((p ?? 0.5) + step, 0, 1));
          else if (e.key === "Enter") submit();
          else return;
          e.preventDefault();
        }}
      >
        <line x1={X0} x2={X1} y1={Y} y2={Y} strokeWidth={6} strokeLinecap="round" className="stroke-foreground" />
        <line x1={X0} x2={X0} y1={Y - 22} y2={Y + 22} strokeWidth={6} className="stroke-foreground" />
        <line x1={X1} x2={X1} y1={Y - 22} y2={Y + 22} strokeWidth={6} className="stroke-foreground" />
        {/* Arrow showing which end to measure from */}
        <polygon
          points={fromLeft ? `${X0 - 4},28 ${X0 + 30},16 ${X0 + 30},40` : `${X1 + 4},28 ${X1 - 30},16 ${X1 - 30},40`}
          className="fill-gold"
        />
        {mx !== null && (
          <g>
            <line x1={mx} x2={mx} y1={Y - 40} y2={Y + 40} strokeWidth={5} className="stroke-gold" />
            <circle cx={mx} cy={Y} r={12} className="fill-gold" />
          </g>
        )}
      </svg>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Tap or drag on the line (← → keys), then lock in.</p>
        <LockButton disabled={pos === null || busy} onClick={submit} />
      </div>
    </div>
  );
}
