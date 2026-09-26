import type {
  AnyFeature,
  Component,
  ParamValue,
  Position,
  SiteContext,
  SiteFeature,
} from "@/lib/schemas";

// P6.3 [B]: road params auto-filled from the existing street a drawn road follows
// (OSM tags in the site context). Flags and allowances for schools, water and rail
// are A's `site.ts`. Pure code; distances use a local flat approximation.

const M_PER_DEG_LAT = 111_320;

type Seg = [Position, Position];
type Shape = { points: Position[]; segs: Seg[]; rings: Position[][] };

function shapeOf(f: AnyFeature, out: Shape) {
  const g = f.geometry;
  const addLine = (line: Position[]) => {
    out.points.push(...line);
    for (let i = 0; i < line.length - 1; i++)
      out.segs.push([line[i]!, line[i + 1]!]);
  };
  if (g.type === "Point") out.points.push(g.coordinates);
  else if (g.type === "LineString") addLine(g.coordinates);
  else if (g.type === "Polygon") {
    for (const ring of g.coordinates) addLine(ring);
    if (g.coordinates[0]) out.rings.push(g.coordinates[0]);
  }
}

const empty = (): Shape => ({ points: [], segs: [], rings: [] });

/** Every drawn shape of a component: primary, building sections, park features. */
export function componentShape(c: Component): Shape {
  const s = empty();
  const g = c.geometry;
  if (!g) return s;
  shapeOf(g.primary, s);
  for (const sec of g.sections ?? []) shapeOf(sec.footprint, s);
  for (const f of g.features) shapeOf(f.geometry, s);
  return s;
}

/** Local metric frame around a latitude. */
function frame(lat: number) {
  const kx = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return (p: Position): [number, number] => [p[0] * kx, p[1] * M_PER_DEG_LAT];
}

function pointSegDist(
  p: [number, number],
  a: [number, number],
  b: [number, number],
) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const k =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2),
        );
  return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
}

function inRing(p: Position, ring: Position[]) {
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

/** Shortest distance (m) between two shapes, 0 if one is inside the other; and the closest point on `a`. */
export function shapeDistance(
  a: Shape,
  b: Shape,
): { distance: number; at: Position } | null {
  if (a.points.length === 0 || b.points.length === 0) return null;
  const lat = a.points[0]![1];
  const m = frame(lat);
  for (const p of a.points)
    if (b.rings.some((r) => inRing(p, r))) return { distance: 0, at: p };
  for (const p of b.points)
    if (a.rings.some((r) => inRing(p, r))) return { distance: 0, at: p };

  let best = Infinity;
  let at = a.points[0]!;
  const aSegs: Seg[] = a.segs.length ? a.segs : a.points.map((p) => [p, p]);
  const bSegs: Seg[] = b.segs.length ? b.segs : b.points.map((p) => [p, p]);
  for (const [a1, a2] of aSegs) {
    const A1 = m(a1);
    const A2 = m(a2);
    for (const [b1, b2] of bSegs) {
      const B1 = m(b1);
      const B2 = m(b2);
      const d1 = pointSegDist(A1, B1, B2);
      const d2 = pointSegDist(A2, B1, B2);
      const d3 = pointSegDist(B1, A1, A2);
      const d4 = pointSegDist(B2, A1, A2);
      const d = Math.min(d1, d2, d3, d4);
      if (d < best) {
        best = d;
        at = d === d2 ? a2 : a1;
      }
    }
  }
  return { distance: best, at };
}

function nearest(
  c: Shape,
  features: SiteFeature[],
): { feature: SiteFeature; distance: number; at: Position } | null {
  let best: { feature: SiteFeature; distance: number; at: Position } | null =
    null;
  for (const f of features) {
    const s = empty();
    shapeOf(f.geometry, s);
    const d = shapeDistance(c, s);
    if (d && (!best || d.distance < best.distance)) best = { feature: f, ...d };
  }
  return best;
}

export type SiteParamSuggestion = {
  paramId: string;
  value: ParamValue;
  evidence: string;
};

const HIGHWAY_CLASS: Record<string, string> = {
  residential: "local",
  living_street: "local",
  unclassified: "local",
  service: "local",
  tertiary: "collector",
  secondary: "arterial",
  primary: "arterial",
  trunk: "arterial",
};

/** Params a road can take from the existing street it follows (OSM tags within 15 m). */
export function siteParamSuggestions(
  c: Component,
  site: SiteContext | undefined,
): SiteParamSuggestion[] {
  if (!site || c.type !== "road" || !c.geometry) return [];
  const road = nearest(
    componentShape(c),
    site.features.filter((f) => f.kind === "road" && f.tags),
  );
  if (!road || road.distance > 15) return [];
  const tags = road.feature.tags!;
  const where = road.feature.name ? ` on ${road.feature.name}` : "";
  const out: SiteParamSuggestion[] = [];
  const lanes = Number(tags.lanes);
  if (Number.isInteger(lanes) && lanes >= 1 && lanes <= 8)
    out.push({
      paramId: "lanes",
      value: lanes,
      evidence: `OpenStreetMap: lanes=${tags.lanes}${where}`,
    });
  const cls = tags.highway ? HIGHWAY_CLASS[tags.highway] : undefined;
  if (cls)
    out.push({
      paramId: "roadClass",
      value: cls,
      evidence: `OpenStreetMap: highway=${tags.highway}${where}`,
    });
  const sidewalk = tags.sidewalk;
  const sides =
    sidewalk === "both"
      ? 2
      : sidewalk === "left" || sidewalk === "right"
        ? 1
        : sidewalk === "no" || sidewalk === "none"
          ? 0
          : undefined;
  if (sides !== undefined)
    out.push({
      paramId: "sidewalkSides",
      value: sides,
      evidence: `OpenStreetMap: sidewalk=${sidewalk}${where}`,
    });
  return out;
}
