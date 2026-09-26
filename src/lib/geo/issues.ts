import { existingBuildingsOn } from "@/engine/demolition";
import type {
  Component,
  Flag,
  Position,
  SiteContext,
  SiteFeature,
} from "@/lib/schemas";
import { localFrame } from "./transform";

// "Things to check" on the map: for each flag caused by something near a component,
// highlight that thing (the buildings to demolish, the creek, the rail line, the
// school) and draw a dashed link from the component to it with the distance.
// Pure; the map layer is src/components/map/issue-highlights.tsx.

type Pt = [number, number];
export type Severity = Flag["severity"];

export type IssueFeature = {
  type: "Feature";
  geometry:
    | { type: "Polygon"; coordinates: Position[][] }
    | { type: "LineString"; coordinates: Position[] }
    | { type: "Point"; coordinates: Position };
  properties: {
    /** area | line | point | link */
    role: "area" | "line" | "point" | "link";
    severity: Severity;
    /** Flag title, and for links the distance ("24 m"). */
    title: string;
    detail: string;
    label: string;
  };
};

/** Which site feature kind each flag code points at. */
const CODE_KIND: Record<string, SiteFeature["kind"]> = {
  near_school: "school",
  near_hospital: "hospital",
  near_waterway: "waterway",
  waterway_nearby: "waterway",
  in_water_permit: "waterway",
  near_rail: "rail",
};

/** How much of a long river or rail line to show around the closest point. */
const LINE_WINDOW_M = 150;

function parts(c: Component): Position[][] {
  const g = c.geometry;
  if (!g) return [];
  const shapes = [
    g.primary.geometry,
    ...(g.sections ?? []).map((s) => s.footprint.geometry),
  ];
  return shapes.map((s) =>
    s.type === "Point"
      ? [s.coordinates]
      : s.type === "LineString"
        ? s.coordinates
        : s.coordinates[0]!,
  );
}

function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const u = len2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
    : 0;
  return [a[0] + u * dx, a[1] + u * dy];
}

const segs = (pts: Pt[]): [Pt, Pt][] =>
  pts.length === 1
    ? [[pts[0]!, pts[0]!]]
    : pts.slice(1).map((p, i) => [pts[i]!, p]);

/** Closest pair of points between two sets of polylines (local metres). */
function closestPair(a: Pt[][], b: Pt[][]): { from: Pt; to: Pt; d: number } {
  let best = { from: [0, 0] as Pt, to: [0, 0] as Pt, d: Infinity };
  const consider = (from: Pt, to: Pt) => {
    const d = Math.hypot(from[0] - to[0], from[1] - to[1]);
    if (d < best.d) best = { from, to, d };
  };
  for (const sa of a.flatMap(segs))
    for (const sb of b.flatMap(segs)) {
      for (const p of sa) consider(p, closestOnSeg(p, sb[0], sb[1]));
      for (const p of sb) consider(closestOnSeg(p, sa[0], sa[1]), p);
    }
  return best;
}

function featureParts(f: SiteFeature): Position[][] {
  const g = f.geometry.geometry;
  return g.type === "Point"
    ? [[g.coordinates]]
    : g.type === "LineString"
      ? [g.coordinates]
      : [g.coordinates[0]!];
}

/** The part of a line within `window` metres (along it) of the point nearest `to`. */
function lineAround(line: Pt[], to: Pt, window: number): Pt[] {
  let at = 0;
  let best = Infinity;
  const dists = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const q = closestOnSeg(to, a, b);
    const d = Math.hypot(q[0] - to[0], q[1] - to[1]);
    if (d < best) {
      best = d;
      at = dists[i - 1]! + Math.hypot(q[0] - a[0], q[1] - a[1]);
    }
    dists.push(dists[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const pointAt = (s: number): Pt => {
    for (let i = 1; i < line.length; i++)
      if (s <= dists[i]! || i === line.length - 1) {
        const a = line[i - 1]!;
        const b = line[i]!;
        const len = dists[i]! - dists[i - 1]!;
        const k = len ? Math.max(0, Math.min(1, (s - dists[i - 1]!) / len)) : 0;
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
    return line[0]!;
  };
  const s0 = Math.max(0, at - window);
  const s1 = Math.min(dists.at(-1)!, at + window);
  return [
    pointAt(s0),
    ...line.filter((_, i) => dists[i]! > s0 && dists[i]! < s1),
    pointAt(s1),
  ];
}

export function issueHighlights(
  components: Component[],
  flags: Flag[],
  site: SiteContext | undefined,
  locale: "en" | "fr" = "en",
): IssueFeature[] {
  const out: IssueFeature[] = [];
  if (!site) return out;
  const fmt = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });
  for (const flag of flags) {
    const title = flag.title[locale];
    const detail = flag.explanation[locale];
    for (const id of flag.componentIds) {
      const c = components.find((x) => x.id === id);
      if (!c?.geometry || !c.visible) continue;
      const origin = parts(c)[0]?.[0];
      if (!origin) continue;
      const { toLocal, fromLocal } = localFrame(origin);
      const mine = parts(c).map((p) => p.map(toLocal));
      const base = { severity: flag.severity, title, detail };

      // Existing buildings in the way: outline each one.
      if (flag.code.startsWith("existing_buildings")) {
        const ids = new Set(existingBuildingsOn(c, site).ids);
        for (const f of site.features)
          if (ids.has(f.id) && f.geometry.geometry.type === "Polygon")
            out.push({
              type: "Feature",
              geometry: f.geometry.geometry,
              properties: { ...base, role: "area", label: "" },
            });
        continue;
      }

      // Something nearby: the nearest one of that kind, and a link to it.
      const kind = CODE_KIND[flag.code];
      if (!kind) continue;
      let nearest: { f: SiteFeature; from: Pt; to: Pt; d: number } | null =
        null;
      for (const f of site.features) {
        if (f.kind !== kind) continue;
        const pair = closestPair(
          mine,
          featureParts(f).map((p) => p.map(toLocal)),
        );
        if (!nearest || pair.d < nearest.d) nearest = { f, ...pair };
      }
      if (!nearest) continue;
      const { f, from, to, d } = nearest;
      const name = f.name ? `${f.name} · ` : "";
      const g = f.geometry.geometry;
      if (g.type === "LineString") {
        const piece = lineAround(g.coordinates.map(toLocal), to, LINE_WINDOW_M);
        if (piece.length >= 2)
          out.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: piece.map(fromLocal) },
            properties: { ...base, role: "line", label: f.name ?? "" },
          });
      } else {
        out.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: fromLocal(to) },
          properties: { ...base, role: "point", label: f.name ?? "" },
        });
      }
      if (d > 1)
        out.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [fromLocal(from), fromLocal(to)],
          },
          properties: {
            ...base,
            role: "link",
            label: `${name}${fmt.format(d)} m`,
          },
        });
    }
  }
  return out;
}
