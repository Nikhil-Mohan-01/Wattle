"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

export type TestProps<P> = {
  params: P;
  busy: boolean;
  onAnswer: (value: number | number[]) => void;
};

/** Converts a pointer position to SVG viewBox units (assumes no preserveAspectRatio cropping). */
export function svgPoint(e: ReactPointerEvent<SVGSVGElement>, w: number, h: number) {
  const rect = e.currentTarget.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * w,
    y: ((e.clientY - rect.top) / rect.height) * h,
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function LockButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-gold px-4 py-2 font-semibold text-black disabled:opacity-50"
    >
      Lock in
    </button>
  );
}
