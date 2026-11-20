"use client";

// Tiny Web Audio helper for the Tempo test's reference beats.

let ctx: AudioContext | null = null;

/**
 * The shared AudioContext, created/resumed on demand. Call it from a click
 * handler first so browsers that need a user gesture let it play.
 */
export function getAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** Schedules a short woodblock-ish click at `when` (AudioContext seconds). */
export function scheduleClick(ac: AudioContext, when: number, accent = false) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = accent ? 1320 : 990;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.5, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
  osc.connect(gain).connect(ac.destination);
  osc.start(when);
  osc.stop(when + 0.08);
}
