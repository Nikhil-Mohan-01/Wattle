"use client";

import { useEffect, useState } from "react";
import { TRACK_BOX, type ActiveTest } from "../shared";
import { LockButton, clamp, svgPoint, type TestProps } from "./common";

type Params = Extract<ActiveTest, { test: "track" }>;

const BALL_R = 14;
const { w: W, h: H } = TRACK_BOX;

export function TrackTest({ params, busy, onAnswer }: TestProps<Params>) {
  const { samples, sampleMs } = params;
  const [frame, setFrame] = useState(0);
  const [aim, setAim] = useState<number | null>(null);
  const flying = frame < samples.length;

  // Play back the visible part of the throw at real speed.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const i = Math.floor((performance.now() - t0) / sampleMs);
      setFrame(Math.min(i, samples.length));
      if (i < samples.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [samples, sampleMs]);

  const ball = flying ? samples[frame] : null;
  const submit = () => {
    if (aim !== null && !flying && !busy) onAnswer(Math.round(aim * 10) / 10);
  };

  return (
    <div className="space-y-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none rounded-xl border border-line bg-card outline-none focus-visible:ring-2 focus-visible:ring-gold"
        tabIndex={0}
        role="slider"
        aria-label="Landing point on the floor"
        aria-valuemin={0}
        aria-valuemax={W}
        aria-valuenow={aim === null ? undefined : Math.round(aim)}
        onPointerDown={(e) => {
          if (flying) return;
          setAim(clamp(svgPoint(e, W, H).x, 0, W));
        }}
        onPointerMove={(e) => {
          if (flying || e.buttons === 0) return;
          setAim(clamp(svgPoint(e, W, H).x, 0, W));
        }}
        onKeyDown={(e) => {
          if (flying) return;
          const step = e.shiftKey ? 50 : 5;
          if (e.key === "ArrowLeft") setAim((a) => clamp((a ?? W / 2) - step, 0, W));
          else if (e.key === "ArrowRight") setAim((a) => clamp((a ?? W / 2) + step, 0, W));
          else if (e.key === "Enter") submit();
          else return;
          e.preventDefault();
        }}
      >
        {/* Floor */}
        <rect x={0} y={H - 8} width={W} height={8} className="fill-line" />
        {ball && <circle cx={ball[0]} cy={H - ball[1]} r={BALL_R} className="fill-gold" />}
        {aim !== null && (
          <g>
            <line x1={aim} x2={aim} y1={H - 60} y2={H - 8} strokeWidth={4} className="stroke-foreground" />
            <polygon points={`${aim - 14},${H - 70} ${aim + 14},${H - 70} ${aim},${H - 48}`} className="fill-foreground" />
          </g>
        )}
      </svg>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {flying ? "Watch the throw…" : "Tap or drag on the floor (← → keys), then lock in."}
        </p>
        <LockButton disabled={aim === null || flying || busy} onClick={submit} />
      </div>
    </div>
  );
}
