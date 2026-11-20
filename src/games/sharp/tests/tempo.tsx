"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudio, scheduleClick } from "../audio";
import { TEMPO_REF_BEATS, TEMPO_TAPS, type ActiveTest } from "../shared";
import type { TestProps } from "./common";

type Params = Extract<ActiveTest, { test: "tempo" }>;

/** Lead-in before the first reference beat, ms. */
const LEAD_MS = 900;

export function TempoTest({ params, busy, onAnswer }: TestProps<Params>) {
  const I = params.intervalMs;
  // performance.now() time of the first reference beat; set once the beats are scheduled.
  const t0 = useRef<number | null>(null);
  const taps = useRef<number[]>([]);
  const sent = useRef(false);
  const [tapCount, setTapCount] = useState(0);
  const [beat, setBeat] = useState(-1); // reference beat currently flashing, -1 none
  const [listening, setListening] = useState(false);

  // Schedule the four audible beats, then drive the visual pulse.
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const ac = getAudio();

    const run = async () => {
      if (ac && ac.state !== "running") await ac.resume().catch(() => {});
      if (cancelled) return;
      if (ac && ac.state === "running") {
        const startAt = ac.currentTime + LEAD_MS / 1000;
        for (let k = 0; k < TEMPO_REF_BEATS; k++) scheduleClick(ac, startAt + (k * I) / 1000, k === 0);
        // Map audio time to performance time, including the time the sound takes to reach the speakers.
        const latency = ((ac.outputLatency || 0) + (ac.baseLatency || 0)) * 1000;
        t0.current = performance.now() + LEAD_MS + latency;
      } else {
        t0.current = performance.now() + LEAD_MS; // visual beats only
      }
      const tick = () => {
        const el = performance.now() - (t0.current as number);
        const k = Math.floor(el / I);
        const flashing = el >= 0 && k < TEMPO_REF_BEATS && el - k * I < 120 ? k : -1;
        setBeat(flashing);
        // Accept taps from half a beat after the last reference beat.
        if (el >= (TEMPO_REF_BEATS - 0.5) * I) {
          setListening(true);
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [I]);

  const tap = useCallback(
    (timeStamp: number) => {
      if (!listening || sent.current || t0.current === null) return;
      const prev = taps.current.at(-1) ?? 0;
      // Offsets must strictly increase even after rounding.
      const t = Math.max(Math.round(timeStamp - t0.current), prev + 1);
      taps.current.push(t);
      setTapCount(taps.current.length);
      if (taps.current.length === TEMPO_TAPS) {
        sent.current = true;
        onAnswer([...taps.current]);
      }
    },
    [listening, onAnswer],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      tap(e.timeStamp);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-hidden>
        {Array.from({ length: TEMPO_REF_BEATS }, (_, k) => (
          <span
            key={k}
            className={`h-6 w-6 rounded-full border-2 border-gold transition-colors duration-75 ${beat === k ? "bg-gold" : ""}`}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={!listening || busy || tapCount >= TEMPO_TAPS}
        onPointerDown={(e) => {
          e.preventDefault();
          tap(e.timeStamp);
        }}
        className="flex h-48 w-full select-none items-center justify-center rounded-2xl border-2 border-line bg-card text-xl font-semibold touch-manipulation disabled:opacity-60"
      >
        {listening ? "Tap (or Space)" : "Listen…"}
      </button>
      <div className="flex justify-center gap-2" aria-label={`${tapCount} of ${TEMPO_TAPS} taps`}>
        {Array.from({ length: TEMPO_TAPS }, (_, k) => (
          <span key={k} className={`h-3 w-3 rounded-full ${k < tapCount ? "bg-foreground" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}
