"use client";

import { useState } from "react";
import type { ActiveTest } from "../shared";
import { svgPoint, type TestProps } from "./common";

type Params = Extract<ActiveTest, { test: "angle" }>;

const S = 400;
const C = S / 2;
const R = 160;

const norm = (a: number) => ((a % 360) + 360) % 360;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Point at `deg` counter-clockwise from the +x axis, in screen coords. */
const at = (deg: number, r = R) => [C + r * Math.cos(rad(deg)), C - r * Math.sin(rad(deg))] as const;

export function AngleTest({ params, busy, onAnswer }: TestProps<Params>) {
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);

  const fromPointer = (x: number, y: number) => norm((Math.atan2(C - y, x - C) * 180) / Math.PI);
  const submit = (a: number) => {
    if (!busy) onAnswer(Math.round(norm(a) * 10) / 10);
  };

  const [ex, ey] = at(angle);
  const [ax, ay] = at(angle, 50);
  const arc = angle > 0.5 ? `M ${C + 50} ${C} A 50 50 0 ${angle > 180 ? 1 : 0} 0 ${ax} ${ay}` : "";

  return (
    <div className="space-y-4">
      <p className="text-center text-3xl font-bold tabular-nums">{params.target}°</p>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="mx-auto w-full max-w-sm touch-none rounded-xl border border-line bg-card outline-none focus-visible:ring-2 focus-visible:ring-gold"
        tabIndex={0}
        role="slider"
        aria-label="Arm angle, counter-clockwise from the flat line. Arrow keys adjust, Enter locks in."
        aria-valuemin={0}
        aria-valuemax={360}
        onPointerDown={(e) => {
          if (busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          const p = svgPoint(e, S, S);
          setAngle(fromPointer(p.x, p.y));
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const p = svgPoint(e, S, S);
          setAngle(fromPointer(p.x, p.y));
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          setDragging(false);
          const p = svgPoint(e, S, S);
          submit(fromPointer(p.x, p.y));
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") setAngle((a) => norm(a + step));
          else if (e.key === "ArrowRight" || e.key === "ArrowDown") setAngle((a) => norm(a - step));
          else if (e.key === "Enter") submit(angle);
          else return;
          e.preventDefault();
        }}
      >
        <circle cx={C} cy={C} r={R} fill="none" strokeDasharray="4 8" strokeWidth={2} className="stroke-line" />
        {arc && <path d={arc} fill="none" strokeWidth={4} className="stroke-gold" />}
        {/* 0° reference */}
        <line x1={C} y1={C} x2={C + R} y2={C} strokeWidth={6} strokeLinecap="round" className="stroke-muted" />
        {/* Player's arm */}
        <line x1={C} y1={C} x2={ex} y2={ey} strokeWidth={6} strokeLinecap="round" className="stroke-foreground" />
        <circle cx={ex} cy={ey} r={14} className="fill-gold" />
        <circle cx={C} cy={C} r={8} className="fill-foreground" />
      </svg>
      <p className="text-center text-sm text-muted">
        Drag the arm counter-clockwise from the grey line and let go. Keyboard: arrows, then Enter.
      </p>
    </div>
  );
}
