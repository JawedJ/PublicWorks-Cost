import type { Position } from "@/lib/schemas";
import { localFrame } from "./transform";

// Map-aware starting layout (P1.10 improved): reads what's already on the ground
// (streets, buildings, water from the basemap tiles) and places components like a
// planner would. Road work goes on real streets; buildings, parking and parks sit
// on open land fronting a street, turned to face it; the parking lot goes next to
// the biggest building; culverts and bridges go where a road crosses water.
// Pure and deterministic for a seed; the map reading lives in the map components.

export type StreetKind = "highway" | "arterial" | "collector" | "local";

/** What's already on the ground around the layout centre, in lng/lat. */
export type Surroundings = {
  streets: { line: Position[]; kind: StreetKind }[];
  /** Existing buildings, water bodies and the user's own shapes: never built over. */
  blocked: Position[][];
  /** Streams, rivers, drains (lines). */
  waterways: Position[][];
  /** Rail lines and the user's own roads: kept clear like streets. */
  keepClear: Position[][];
};

type Pt = [number, number];
type Ring = Pt[];
type Box = { x0: number; y0: number; x1: number; y1: number };

/** Half the street's width, to its curb, for keeping sites off it. */
export const STREET_HALF_WIDTH: Record<StreetKind, number> = {
  highway: 18,
  arterial: 12,
  collector: 9,
  local: 7,
};

// ---------- geometry helpers (local metres) ----------

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

function boxOf(pts: Pt[], pad = 0): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const len2 = ab[0] ** 2 + ab[1] ** 2;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2),
        );
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(
    segDist(a, c, d),
    segDist(b, c, d),
    segDist(c, a, b),
    segDist(d, a, b),
  );
}

function inRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

const edges = (pts: Pt[], closed: boolean): [Pt, Pt][] => {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([pts[i]!, pts[i + 1]!]);
  if (closed && pts.length > 2) out.push([pts[pts.length - 1]!, pts[0]!]);
  return out;
};

/** Shortest distance between a polygon and a polyline or polygon (0 if they touch or one holds the other). */
function shapeDist(poly: Ring, other: Pt[], otherClosed: boolean): number {
  if (other.some((p) => inRing(p, poly))) return 0;
  if (otherClosed && poly.some((p) => inRing(p, other))) return 0;
  let best = Infinity;
  for (const [a, b] of edges(poly, true))
    for (const [c, d] of edges(other, otherClosed)) {
      best = Math.min(best, segSegDist(a, b, c, d));
      if (best === 0) return 0;
    }
  return best;
}

function polylineLength(line: Pt[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += dist(line[i - 1]!, line[i]!);
  return s;
}

/** Point and unit tangent at distance `s` along a polyline. */
function along(line: Pt[], s: number): { p: Pt; t: Pt } {
  let rest = Math.max(0, s);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const l = dist(a, b);
    if (rest <= l || i === line.length - 1) {
      const k = l === 0 ? 0 : Math.min(1, rest / l);
      return {
        p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k],
        t: l === 0 ? [1, 0] : [(b[0] - a[0]) / l, (b[1] - a[1]) / l],
      };
    }
    rest -= l;
  }
  return { p: line[0]!, t: [1, 0] };
}

/** The piece of a polyline between distances s0 and s1. */
function slice(line: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [along(line, s0).p];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1]!, line[i]!);
    if (acc > s0 && acc < s1) out.push(line[i]!);
  }
  out.push(along(line, s1).p);
  return out;
}

/** Distance along a polyline of the point nearest to `p`. */
function project(line: Pt[], p: Pt): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const l = dist(a, b);
    const t =
      l === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) /
                l ** 2,
            ),
          );
    const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = dist(p, q);
    if (d < best.d) best = { s: acc + l * t, d };
    acc += l;
  }
  return best;
}

/** Joins tile fragments of the same street kind whose ends meet into longer streets. */
function joinStreets(
  parts: { line: Pt[]; kind: StreetKind }[],
): { line: Pt[]; kind: StreetKind }[] {
  const pool = parts
    .filter((p) => p.line.length >= 2)
    .map((p) => ({ ...p, line: [...p.line] }));
  const out: { line: Pt[]; kind: StreetKind }[] = [];
  const near = (a: Pt, b: Pt) => dist(a, b) < 1.5;
  while (pool.length) {
    const cur = pool.pop()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const o = pool[i]!;
        if (o.kind !== cur.kind) continue;
        const head = cur.line[0]!;
        const tail = cur.line[cur.line.length - 1]!;
        const oh = o.line[0]!;
        const ot = o.line[o.line.length - 1]!;
        if (near(tail, oh)) cur.line.push(...o.line.slice(1));
        else if (near(tail, ot))
          cur.line.push(...[...o.line].reverse().slice(1));
        else if (near(head, ot)) cur.line.unshift(...o.line.slice(0, -1));
        else if (near(head, oh))
          cur.line.unshift(...[...o.line].reverse().slice(0, -1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

/** Coarse grid of shapes by bounding box, for fast "what's near here". */
class ShapeIndex<T extends { box: Box }> {
  private cells = new Map<string, T[]>();
  constructor(private size = 60) {}
  private keys(b: Box): string[] {
    const k: string[] = [];
    for (
      let x = Math.floor(b.x0 / this.size);
      x <= Math.floor(b.x1 / this.size);
      x++
    )
      for (
        let y = Math.floor(b.y0 / this.size);
        y <= Math.floor(b.y1 / this.size);
        y++
      )
        k.push(`${x},${y}`);
    return k;
  }
  add(item: T) {
    for (const k of this.keys(item.box)) {
      const list = this.cells.get(k);
      if (list) list.push(item);
      else this.cells.set(k, [item]);
    }
  }
  near(b: Box): Set<T> {
    const out = new Set<T>();
    for (const k of this.keys(b))
      for (const it of this.cells.get(k) ?? []) out.add(it);
    return out;
  }
}

// ---------- the planner ----------

export type LayoutItem =
  | { id: string; kind: "road"; lengthM: number; roadClass?: string }
  | {
      id: string;
      kind: "area";
      role: "building" | "parking" | "park" | "custom";
      /** The whole plot to keep clear (a building's site includes its setback). */
      widthM: number;
      depthM: number;
    }
  | { id: string; kind: "crossing" }
  | { id: string; kind: "spot" };

export type Placement =
  | { kind: "line"; line: Position[] }
  | { kind: "area"; centre: Position; bearingDeg: number }
  | { kind: "point"; at: Position };

type Obstacle = { box: Box; pts: Pt[]; closed: boolean; clear: number };

const SEARCH_RADIUS_M = 900;

/**
 * Places items on real ground. Returns placements for the items it could place;
 * the caller falls back to the plain grid layout for the rest.
 */
export function planSite(
  items: LayoutItem[],
  centre: Position,
  surroundings: Surroundings,
  rand: () => number,
  boundary?: Position[],
): Record<string, Placement> {
  const { toLocal, fromLocal } = localFrame(centre);
  const local = (line: Position[]) => line.map(toLocal) as Pt[];
  const within = (pts: Pt[]) =>
    pts.some((p) => Math.hypot(p[0], p[1]) < SEARCH_RADIUS_M + 300);
  const area = boundary ? (local(boundary) as Ring) : null;
  const out: Record<string, Placement> = {};

  const streets = joinStreets(
    surroundings.streets
      .map((s) => ({ line: local(s.line), kind: s.kind }))
      .filter((s) => within(s.line)),
  );
  const waterways = surroundings.waterways.map(local).filter(within);

  // Everything a new plot must stay clear of, with the clearance it needs.
  const obstacles = new ShapeIndex<Obstacle>();
  const addObstacle = (pts: Pt[], closed: boolean, clear: number) =>
    obstacles.add({ box: boxOf(pts, clear), pts, closed, clear });
  for (const s of streets)
    addObstacle(s.line, false, STREET_HALF_WIDTH[s.kind]);
  for (const r of surroundings.keepClear.map(local).filter(within))
    addObstacle(r, false, 15);
  for (const w of waterways) addObstacle(w, false, 10);
  for (const b of surroundings.blocked.map(local).filter(within)) {
    const ring =
      b.length > 1 && dist(b[0]!, b[b.length - 1]!) < 0.01 ? b.slice(0, -1) : b;
    if (ring.length >= 3) addObstacle(ring, true, 3);
  }

  const fits = (poly: Ring) => {
    if (area && !poly.every((p) => inRing(p, area))) return false;
    for (const o of obstacles.near(boxOf(poly)))
      if (shapeDist(poly, o.pts, o.closed) < o.clear) return false;
    return true;
  };

  const rectAt = (c: Pt, w: number, d: number, t: Pt): Ring => {
    const n: Pt = [-t[1], t[0]];
    return [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ].map(([x, y]) => [
      c[0] + t[0] * x! + n[0] * y!,
      c[1] + t[1] * x! + n[1] * y!,
    ]);
  };

  // --- 1. Road work goes on existing streets, the closest suitable one first.
  const wantKind = (roadClass?: string): StreetKind =>
    roadClass === "arterial"
      ? "arterial"
      : roadClass === "collector"
        ? "collector"
        : "local";
  const used = new Set<number>();
  const newRoads: { line: Pt[]; kind: StreetKind }[] = [];
  for (const item of items) {
    if (item.kind !== "road") continue;
    const want = wantKind(item.roadClass);
    let best: { i: number; score: number; s: number } | null = null;
    streets.forEach((s, i) => {
      if (used.has(i) || s.kind === "highway") return;
      const len = polylineLength(s.line);
      if (len < Math.min(80, item.lengthM)) return;
      const { s: at, d } = project(s.line, [0, 0]);
      if (d > SEARCH_RADIUS_M) return;
      const score =
        d +
        (s.kind === want ? 0 : 120) +
        Math.max(0, item.lengthM - len) * 0.3 +
        rand() * 80;
      if (!best || score < best.score) best = { i, score, s: at };
    });
    if (!best) continue;
    const { i, s: at } = best as { i: number; s: number };
    used.add(i);
    const line = streets[i]!.line;
    const len = polylineLength(line);
    const piece = Math.min(item.lengthM, len);
    const s0 = Math.max(0, Math.min(len - piece, at - piece / 2));
    const part = slice(line, s0, s0 + piece);
    newRoads.push({ line: part, kind: streets[i]!.kind });
    out[item.id] = { kind: "line", line: part.map(fromLocal) };
  }

  // --- 2. Frontage: points every 12 m along streets, both sides, facing the street.
  type Front = { p: Pt; t: Pt; n: Pt; half: number; onNewRoad: boolean };
  const fronts: Front[] = [];
  const addFronts = (line: Pt[], kind: StreetKind, onNewRoad: boolean) => {
    if (kind === "highway") return;
    const len = polylineLength(line);
    for (let s = 6; s < len; s += 12) {
      const { p, t } = along(line, s);
      if (Math.hypot(p[0], p[1]) > SEARCH_RADIUS_M) continue;
      for (const side of [1, -1])
        fronts.push({
          p,
          t,
          n: [-t[1] * side, t[0] * side],
          half: STREET_HALF_WIDTH[kind],
          onNewRoad,
        });
    }
  };
  for (const s of streets) addFronts(s.line, s.kind, false);
  for (const r of newRoads) addFronts(r.line, r.kind, true);

  const placedAreas: { role: string; ring: Ring; centre: Pt; size: number }[] =
    [];

  const placeArea = (
    item: Extract<LayoutItem, { kind: "area" }>,
    anchor: Pt,
  ) => {
    const { widthM: w, depthM: d } = item;
    const jitter = () => rand() * 60;
    const candidates = fronts
      .map((f) => {
        // Long side along the street, set back 2 m past the curb.
        const c: Pt = [
          f.p[0] + f.n[0] * (f.half + 2 + d / 2),
          f.p[1] + f.n[1] * (f.half + 2 + d / 2),
        ];
        return {
          c,
          t: f.t,
          score: dist(c, anchor) - (f.onNewRoad ? 250 : 0) + jitter(),
        };
      })
      .sort((a, b) => a.score - b.score);
    for (const cand of candidates.slice(0, 1500)) {
      const ring = rectAt(cand.c, w, d, cand.t);
      if (!fits(ring)) continue;
      return { ring, c: cand.c, t: cand.t };
    }
    // Open ground away from streets (e.g. a big park behind a block).
    const open: { c: Pt; score: number }[] = [];
    for (let x = -SEARCH_RADIUS_M; x <= SEARCH_RADIUS_M; x += 30)
      for (let y = -SEARCH_RADIUS_M; y <= SEARCH_RADIUS_M; y += 30)
        open.push({ c: [x, y], score: dist([x, y], anchor) + jitter() });
    open.sort((a, b) => a.score - b.score);
    for (const cand of open.slice(0, 800)) {
      const nearest = fronts.reduce<Front | null>(
        (b, f) => (!b || dist(f.p, cand.c) < dist(b.p, cand.c) ? f : b),
        null,
      );
      const t = nearest?.t ?? [1, 0];
      const ring = rectAt(cand.c, w, d, t);
      if (fits(ring)) return { ring, c: cand.c, t };
    }
    return null;
  };

  const commit = (
    id: string,
    role: string,
    got: { ring: Ring; c: Pt; t: Pt },
  ) => {
    addObstacle(got.ring, true, 4);
    placedAreas.push({
      role,
      ring: got.ring,
      centre: got.c,
      size: polygonArea(got.ring),
    });
    out[id] = {
      kind: "area",
      centre: fromLocal(got.c),
      bearingDeg: (Math.atan2(got.t[1], got.t[0]) * 180) / Math.PI,
    };
  };

  // --- 3. Buildings (largest first), then parking beside the biggest building,
  // custom elements, and parks last (they need the most room).
  const areas = items.filter(
    (i): i is Extract<LayoutItem, { kind: "area" }> => i.kind === "area",
  );
  const byRole = (role: string) =>
    areas
      .filter((a) => a.role === role)
      .sort((a, b) => b.widthM * b.depthM - a.widthM * a.depthM);
  const newRoadMid: Pt | null = newRoads.length
    ? along(newRoads[0]!.line, polylineLength(newRoads[0]!.line) / 2).p
    : null;
  const start: Pt = newRoadMid ?? [0, 0];
  /** Keeps the project together: halfway between the start and what's placed so far. */
  const home = (): Pt => {
    if (!placedAreas.length) return start;
    const n = placedAreas.length;
    const mx = placedAreas.reduce((s, a) => s + a.centre[0], 0) / n;
    const my = placedAreas.reduce((s, a) => s + a.centre[1], 0) / n;
    return [(start[0] + mx) / 2, (start[1] + my) / 2];
  };

  for (const b of byRole("building")) {
    const got = placeArea(b, home());
    if (got) commit(b.id, "building", got);
  }
  for (const p of byRole("parking")) {
    const biggest = placedAreas
      .filter((a) => a.role === "building")
      .sort((a, b) => b.size - a.size)[0];
    const got = placeArea(p, biggest?.centre ?? home());
    if (got) commit(p.id, "parking", got);
  }
  for (const c of byRole("custom")) {
    const got = placeArea(c, home());
    if (got) commit(c.id, "custom", got);
  }
  for (const p of byRole("park")) {
    const got = placeArea(p, home());
    if (got) commit(p.id, "park", got);
  }

  // --- 4. Culverts and bridges where a road crosses water; other structures by a street.
  const crossings: Pt[] = [];
  const roadsForCrossing = [...newRoads, ...streets].map((r) => r.line);
  for (const r of roadsForCrossing)
    for (const w of waterways)
      for (const [a, b] of edges(r, false))
        for (const [c, d] of edges(w, false))
          if (segsCross(a, b, c, d)) {
            const den = cross(sub(b, a), sub(d, c));
            const k = cross(sub(c, a), sub(d, c)) / den;
            crossings.push([
              a[0] + (b[0] - a[0]) * k,
              a[1] + (b[1] - a[1]) * k,
            ]);
          }
  const takenCrossings = new Set<number>();
  for (const item of items) {
    if (item.kind === "crossing") {
      let best = -1;
      let bestScore = Infinity;
      crossings.forEach((p, i) => {
        if (takenCrossings.has(i)) return;
        const onNew = newRoads.some((r) => project(r.line, p).d < 1);
        const score = dist(p, home()) - (onNew ? 300 : 0) + rand() * 40;
        if (score < bestScore && dist(p, [0, 0]) < SEARCH_RADIUS_M) {
          best = i;
          bestScore = score;
        }
      });
      if (best >= 0) {
        takenCrossings.add(best);
        out[item.id] = { kind: "point", at: fromLocal(crossings[best]!) };
        continue;
      }
    }
    if (item.kind === "crossing" || item.kind === "spot") {
      // No crossing nearby (or a pumping station): by the nearest new road, else a street.
      const got = placeArea(
        { id: item.id, kind: "area", role: "custom", widthM: 12, depthM: 12 },
        home(),
      );
      if (got) {
        addObstacle(got.ring, true, 4);
        out[item.id] = { kind: "point", at: fromLocal(got.c) };
      }
    }
  }
  return out;
}

function polygonArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    s += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  return Math.abs(s) / 2;
}
