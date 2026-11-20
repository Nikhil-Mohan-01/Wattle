import "server-only";
import type { GeometryCollection, Topology } from "topojson-specification";
import { feature } from "topojson-client";
import type { Geometry, Position } from "geojson";
import world from "world-atlas/countries-50m.json";

const EARTH_RADIUS_KM = 6371;
/** Consecutive border vertices per chunk; each chunk gets a bounding cap. */
const CHUNK = 48;

/**
 * A country's border vertices as unit vectors, grouped into chunks of nearby
 * points (consecutive along a ring), each with a bounding cap: a centre
 * direction and the angle that contains every point in the chunk.
 */
type Shape = {
  xyz: Float64Array;
  chunks: { start: number; end: number; cx: number; cy: number; cz: number; radius: number }[];
};

const topology = world as unknown as Topology<{ countries: GeometryCollection }>;

/** world-atlas id → geometries (Australia has two features with id 036). */
let geometriesById: Map<string, Geometry[]> | null = null;
const shapes = new Map<string, Shape>();

function geometries(): Map<string, Geometry[]> {
  if (geometriesById) return geometriesById;
  const map = new Map<string, Geometry[]>();
  for (const f of feature(topology, topology.objects.countries).features) {
    const id = f.id === undefined ? null : String(f.id);
    if (!id || !f.geometry) continue;
    map.set(id, [...(map.get(id) ?? []), f.geometry]);
  }
  geometriesById = map;
  return map;
}

/** Whether the 50m map has a shape for this id. */
export function hasShape(id: string): boolean {
  return geometries().has(id);
}

function rings(g: Geometry): Position[][] {
  switch (g.type) {
    case "Polygon":
      return g.coordinates;
    case "MultiPolygon":
      return g.coordinates.flat();
    case "GeometryCollection":
      return g.geometries.flatMap(rings);
    default:
      return [];
  }
}

function shape(id: string): Shape {
  const cached = shapes.get(id);
  if (cached) return cached;
  const geoms = geometries().get(id);
  if (!geoms) throw new Error(`No geometry for country ${id}`);

  const allRings = geoms.flatMap(rings);
  const total = allRings.reduce((n, r) => n + r.length, 0);
  const xyz = new Float64Array(total * 3);
  const chunks: Shape["chunks"] = [];
  let i = 0;
  for (const ring of allRings) {
    for (let s = 0; s < ring.length; s += CHUNK) {
      const start = i;
      for (const [lon, lat] of ring.slice(s, s + CHUNK)) {
        const λ = (lon * Math.PI) / 180;
        const φ = (lat * Math.PI) / 180;
        xyz[i * 3] = Math.cos(φ) * Math.cos(λ);
        xyz[i * 3 + 1] = Math.cos(φ) * Math.sin(λ);
        xyz[i * 3 + 2] = Math.sin(φ);
        i++;
      }
      chunks.push(cap(xyz, start, i));
    }
  }
  const result = { xyz, chunks };
  shapes.set(id, result);
  return result;
}

function angle(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.acos(Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz)));
}

function cap(xyz: Float64Array, start: number, end: number): Shape["chunks"][number] {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let k = start; k < end; k++) {
    cx += xyz[k * 3];
    cy += xyz[k * 3 + 1];
    cz += xyz[k * 3 + 2];
  }
  const len = Math.hypot(cx, cy, cz) || 1;
  cx /= len;
  cy /= len;
  cz /= len;
  let radius = 0;
  for (let k = start; k < end; k++) {
    radius = Math.max(radius, angle(cx, cy, cz, xyz[k * 3], xyz[k * 3 + 1], xyz[k * 3 + 2]));
  }
  return { start, end, cx, cy, cz, radius };
}

/**
 * Minimum great-circle distance in km between the border vertices of two
 * countries. Neighbours share border vertices in the TopoJSON, so they come
 * out as 0. Chunk pairs are checked nearest-first and skipped once their
 * caps can't beat the best distance found so far.
 */
export function distanceKm(aId: string, bId: string): number {
  if (aId === bId) return 0;
  const a = shape(aId);
  const b = shape(bId);

  const pairs: { lower: number; i: number; j: number }[] = [];
  for (let i = 0; i < a.chunks.length; i++) {
    const p = a.chunks[i];
    for (let j = 0; j < b.chunks.length; j++) {
      const q = b.chunks[j];
      const lower = angle(p.cx, p.cy, p.cz, q.cx, q.cy, q.cz) - p.radius - q.radius;
      pairs.push({ lower, i, j });
    }
  }
  pairs.sort((x, y) => x.lower - y.lower);

  // Track the best as a dot product (higher = closer) to avoid acos in the loop.
  let bestDot = -1;
  let bestAngle = Math.PI;
  for (const { lower, i, j } of pairs) {
    if (lower >= bestAngle) break;
    const p = a.chunks[i];
    const q = b.chunks[j];
    for (let u = p.start; u < p.end; u++) {
      const ux = a.xyz[u * 3];
      const uy = a.xyz[u * 3 + 1];
      const uz = a.xyz[u * 3 + 2];
      for (let v = q.start; v < q.end; v++) {
        const d = ux * b.xyz[v * 3] + uy * b.xyz[v * 3 + 1] + uz * b.xyz[v * 3 + 2];
        if (d > bestDot) bestDot = d;
      }
    }
    bestAngle = Math.acos(Math.min(1, bestDot));
    if (bestAngle === 0) break;
  }
  return Math.round(bestAngle * EARTH_RADIUS_KM);
}
