"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { geoArea, geoCentroid, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Feature, FeatureCollection, Geometry, MultiLineString, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { GameProps } from "@/games/use-game";
import { COUNTRIES, normalizeName } from "./countries";
import type { HotColdMove, HotColdView } from "./server";

// ---------- Heat colours ----------

/** 0 (cold, far away) … 1 (hot, touching). Squared so nearby guesses spread out more. */
function heat(km: number): number {
  return (1 - Math.min(km, 10000) / 10000) ** 2;
}

const STOPS: [number, [number, number, number]][] = [
  [0, [238, 234, 224]],
  [0.35, [252, 217, 168]],
  [0.6, [245, 158, 66]],
  [0.8, [229, 83, 43]],
  [1, [159, 18, 57]],
];

function heatColour(km: number): string {
  const t = heat(km);
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(159, 18, 57)";
}

function heatSquare(km: number, correct: boolean): string {
  if (correct) return "🟩";
  if (km < 500) return "🟥";
  if (km < 2000) return "🟧";
  if (km < 5000) return "🟨";
  return "⬜";
}

function formatKm(km: number): string {
  return `${km.toLocaleString("en-CA")} km`;
}

// ---------- Globe ----------

type CountryFeature = Feature<Geometry, { name?: string }>;
type MapData = {
  features: CountryFeature[];
  borders: MultiLineString;
  /** id → where to point the globe (centre of its largest polygon). */
  centres: Map<string, [number, number]>;
};

let mapPromise: Promise<MapData> | null = null;

/** Loads the 50m map once, as a separate lazily-loaded chunk. */
function loadMap(): Promise<MapData> {
  mapPromise ??= import("world-atlas/countries-50m.json").then((mod) => {
    const topo = mod.default as unknown as Topology<{ countries: GeometryCollection }>;
    const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name?: string }>;
    const features = fc.features.filter((f) => f.id !== undefined && String(f.id) !== "010");
    const centres = new Map<string, [number, number]>();
    const best = new Map<string, number>();
    for (const f of features) {
      const id = String(f.id);
      const polys: Polygon[] =
        f.geometry.type === "Polygon"
          ? [f.geometry]
          : f.geometry.type === "MultiPolygon"
            ? f.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }))
            : [];
      for (const p of polys) {
        const area = geoArea(p);
        if (area > (best.get(id) ?? -1)) {
          best.set(id, area);
          centres.set(id, geoCentroid(p) as [number, number]);
        }
      }
    }
    const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
    return { features, borders, centres };
  });
  return mapPromise;
}

type Palette = { ocean: string; land: string; border: string; outline: string; highlight: string };

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ocean: v("--card", "#ffffff"),
    land: v("--line", "#e6dfcd"),
    border: v("--muted", "#6b6558"),
    outline: v("--foreground", "#16140f"),
    highlight: v("--gold", "#e4b429"),
  };
}

type Rotation = [number, number];

function Globe({
  colours,
  focusId,
  answerId,
}: {
  /** id → fill colour for guessed countries. */
  colours: Map<string, string>;
  focusId: string | null;
  answerId: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState(320);
  const [rotation, setRotation] = useState<Rotation>([-80, -30]); // Start over Waterloo-ish.
  // Bumped when the light/dark theme changes, so the globe redraws.
  const [themeTick, setThemeTick] = useState(0);
  const rotationRef = useRef(rotation);
  const animRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; r: Rotation } | null>(null);

  useEffect(() => {
    let live = true;
    loadMap().then(
      (m) => live && setMap(m),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  // Fit the canvas to its container and follow the light/dark theme.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize(Math.max(240, Math.min(440, Math.floor(entry.contentRect.width))));
    });
    ro.observe(el);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => setThemeTick((t) => t + 1);
    mq.addEventListener("change", onTheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onTheme);
    };
  }, []);

  const stopAnimation = () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  // Turn the globe to face the latest guess (or the answer once revealed).
  const target = answerId ?? focusId;
  useEffect(() => {
    const centre = target && map?.centres.get(target);
    if (!centre) return;
    stopAnimation();
    const to: Rotation = [-centre[0], Math.max(-60, Math.min(60, -centre[1]))];
    const from = rotationRef.current;
    // Take the short way round in longitude.
    const dLon = ((((to[0] - from[0]) % 360) + 540) % 360) - 180;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const t = Math.min(1, (now - t0) / 900);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
      setRotation([from[0] + dLon * e, from[1] + (to[1] - from[1]) * e]);
      animRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animRef.current = requestAnimationFrame(step);
    return stopAnimation;
  }, [target, map]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const palette = readPalette();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const projection = geoOrthographic()
      .scale(size / 2 - 4)
      .translate([size / 2, size / 2])
      .rotate(rotation)
      .clipAngle(90)
      .precision(0.5);
    const path = geoPath(projection, ctx);

    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.fillStyle = palette.ocean;
    ctx.fill();

    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = palette.land;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    for (const f of map.features) if (!colours.has(String(f.id))) path(f);
    ctx.fillStyle = palette.land;
    ctx.fill();

    for (const f of map.features) {
      const fill = colours.get(String(f.id));
      if (!fill) continue;
      ctx.beginPath();
      path(f);
      ctx.fillStyle = fill;
      ctx.fill();
    }

    ctx.beginPath();
    path(map.borders);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const ring = answerId ?? focusId;
    if (ring) {
      ctx.beginPath();
      for (const f of map.features) if (String(f.id) === ring) path(f);
      ctx.strokeStyle = answerId ? palette.highlight : palette.outline;
      ctx.lineWidth = answerId ? 2 : 1.25;
      ctx.stroke();
    }

    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [map, themeTick, size, rotation, colours, focusId, answerId]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    stopAnimation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, r: rotation };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const k = 180 / (Math.PI * (size / 2)); // degrees per pixel at the centre
    setRotation([
      drag.r[0] + (e.clientX - drag.x) * k,
      Math.max(-90, Math.min(90, drag.r[1] - (e.clientY - drag.y) * k)),
    ]);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const nudge = (dLon: number, dLat: number) => {
    stopAnimation();
    setRotation(([lon, lat]) => [lon + dLon, Math.max(-90, Math.min(90, lat + dLat))]);
  };

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      {failed ? (
        <p className="py-10 text-sm text-muted">The globe couldn&apos;t load, but you can still play.</p>
      ) : (
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="Globe showing your guesses. Drag or use arrow keys to rotate."
          style={{ width: size, height: size, touchAction: "none" }}
          className="cursor-grab rounded-full active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-gold"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(e) => {
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [10, 0],
              ArrowRight: [-10, 0],
              ArrowUp: [0, -10],
              ArrowDown: [0, 10],
            };
            const m = moves[e.key];
            if (!m) return;
            e.preventDefault();
            nudge(m[0], m[1]);
          }}
        />
      )}
    </div>
  );
}

// ---------- Guess input with autocomplete ----------

const SEARCH = COUNTRIES.map((c) => ({ ...c, key: normalizeName(c.name) }));

function GuessInput({ onGuess, disabled }: { onGuess: (name: string) => Promise<boolean>; disabled: boolean }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = normalizeName(text);
    if (!q) return [];
    const starts = SEARCH.filter((c) => c.key.startsWith(q));
    const contains = SEARCH.filter((c) => !c.key.startsWith(q) && c.key.includes(q));
    return [...starts, ...contains].slice(0, 6);
  }, [text]);

  const submit = async (name: string) => {
    if (!name.trim() || disabled) return;
    setOpen(false);
    if (await onGuess(name)) {
      setText("");
      setActive(0);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(showList ? suggestions[Math.min(active, suggestions.length - 1)].name : text);
      }}
    >
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          maxLength={80}
          placeholder="Type a country…"
          aria-label="Country guess"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-lg bg-gold px-4 py-2 font-semibold text-black hover:bg-gold-deep disabled:opacity-50"
        >
          Guess
        </button>
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-line bg-card shadow-lg"
        >
          {suggestions.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              // mousedown, so it fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                void submit(c.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-gold/25" : ""}`}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

// ---------- Game ----------

export default function HotColdClient({ snapshot, start, move, busy, error }: GameProps<HotColdView, HotColdMove>) {
  const { status, view, date } = snapshot;
  const [copied, setCopied] = useState(false);
  const done = status === "done";
  const answerId = view.answer?.id ?? null;

  const colours = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of view.guesses) m.set(g.id, heatColour(g.distanceKm));
    if (answerId) m.set(answerId, heatColour(0));
    return m;
  }, [view.guesses, answerId]);

  const guess = useCallback((country: string) => move({ country }), [move]);

  if (status === "new") {
    return (
      <div className="mx-auto max-w-[600px] rounded-xl border border-line bg-card p-6">
        <h2 className="text-xl font-semibold">How to play</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>There&apos;s a mystery country. Guess any country to start.</li>
          <li>
            Each guess shows how far its border is from the mystery country&apos;s border, and lights up on
            the globe from <span className="font-semibold">pale</span> (far) to{" "}
            <span className="font-semibold text-red-700">deep red</span> (very close). Neighbours show 0 km.
          </li>
          <li>Unknown names and repeats don&apos;t cost a guess. Fewer guesses means a higher score.</li>
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

  const chronological = [...view.guesses].sort((a, b) => a.n - b.n);
  const squares = chronological.map((g) => heatSquare(g.distanceKm, g.id === answerId && view.solved));
  const shownSquares = squares.length > 12 ? ["…", ...squares.slice(-12)] : squares;
  const share = done
    ? [
        view.solved
          ? `Wattle Hot & Cold ${date} — 🌍 in ${view.count} ${view.count === 1 ? "guess" : "guesses"}`
          : `Wattle Hot & Cold ${date} — 🏳️ after ${view.count} ${view.count === 1 ? "guess" : "guesses"}`,
        shownSquares.join(""),
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
      <Globe colours={colours} focusId={view.latestId} answerId={answerId} />

      {!done && (
        <>
          <GuessInput onGuess={guess} disabled={busy} />
          <div className="flex w-full items-center justify-between text-sm text-muted">
            <span>
              Guess {view.count + 1} of {view.maxGuesses}
              {view.closestKm !== null && <> · closest {formatKm(view.closestKm)}</>}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Give up and reveal the country? You'll score 0.")) void move({ giveUp: true });
              }}
              className="underline hover:text-foreground disabled:opacity-50"
            >
              Give up
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {done && (
        <div className="w-full rounded-xl border border-line bg-card p-4 text-center">
          <p className="text-lg font-semibold">
            {view.solved
              ? `Found it in ${view.count} ${view.count === 1 ? "guess" : "guesses"}!`
              : view.gaveUp
                ? "You gave up."
                : "Out of guesses."}
          </p>
          <p className="mt-1 text-sm text-muted">
            The country was <span className="font-bold text-foreground">{view.answer?.name}</span>
          </p>
          <p className="mt-1 text-sm">
            Score: <span className="font-semibold">{snapshot.rawScore ?? 0}</span>
          </p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-tight">{share}</pre>
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-3 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black hover:bg-gold-deep"
          >
            {copied ? "Copied!" : "Copy result"}
          </button>
        </div>
      )}

      {view.guesses.length > 0 && (
        <ol className="w-full divide-y divide-line rounded-xl border border-line bg-card" aria-label="Your guesses, closest first">
          {view.guesses.map((g) => {
            const correct = g.id === answerId && view.solved;
            return (
              <li
                key={g.id}
                className={`flex items-center gap-3 px-3 py-2 text-sm ${g.id === view.latestId && !done ? "font-semibold" : ""}`}
              >
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-sm border border-line"
                  style={{ background: heatColour(g.distanceKm) }}
                />
                <span className="flex-1 truncate">
                  {g.name}
                  <span className="ml-2 text-xs font-normal text-muted">#{g.n}</span>
                </span>
                <span className={correct ? "font-semibold text-good" : "tabular-nums text-muted"}>
                  {correct ? "Found!" : formatKm(g.distanceKm)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
