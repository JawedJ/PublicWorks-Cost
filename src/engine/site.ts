import type {
  AnyFeature,
  Component,
  ParamValue,
  Position,
  SiteContext,
  SiteFeature,
} from "@/lib/schemas";
import { L, t } from "./text";
import type { TemplateFlag } from "./types";

// P6.3 (SPEC 7.7): flags and auto-filled params from the site context lookup
// (schools, hospitals, waterways, rail, floodplain, existing roads). Pure code;
// distances use a local flat approximation, fine at site scale.

const M_PER_DEG_LAT = 111_320;

/** Flag distances (m), SPEC 7.7. */
export const SITE_DISTANCE_M = {
  waterway: 30,
  rail: 30,
  school: 200,
  hospital: 200,
  floodplain: 0,
} as const;

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

const round = (n: number) => Math.round(n);

/** Site flags for one drawn component. `skip` holds codes a template already raised. */
export function siteFlags(
  c: Component,
  site: SiteContext | undefined,
  skip: Set<string> = new Set(),
): TemplateFlag[] {
  if (!site || site.features.length === 0 || !c.geometry) return [];
  const shape = componentShape(c);
  const out: TemplateFlag[] = [];
  const of = (kind: SiteFeature["kind"]) =>
    site.features.filter((f) => f.kind === kind);
  const loc = (p: Position) => ({ lng: p[0], lat: p[1] });

  const water = nearest(shape, of("waterway"));
  if (
    water &&
    water.distance <= SITE_DISTANCE_M.waterway &&
    !skip.has("in_water_permit")
  ) {
    const name = water.feature.name ?? "A watercourse";
    out.push({
      code: "waterway_permit",
      severity: c.type === "structure" ? "high" : "warning",
      title: L(
        "Conservation authority permit likely",
        "Permis de l'office de protection de la nature probable",
      ),
      explanation: t(
        name,
        L(
          ` is about ${round(water.distance)} m from ${c.name}. Work within 30 m of a watercourse usually needs a conservation authority permit and may have an in-water work timing window.`,
          ` est à environ ${round(water.distance)} m de ${c.name}. Les travaux à moins de 30 m d'un cours d'eau exigent habituellement un permis et peuvent avoir une période de travaux en eau.`,
        ),
      ),
      componentIds: [c.id],
      location: loc(water.at),
    });
  }

  const rail = nearest(shape, of("rail"));
  if (rail && rail.distance <= SITE_DISTANCE_M.rail) {
    out.push({
      code: "rail_approval",
      severity: "warning",
      title: L("Railway approval needed", "Approbation ferroviaire requise"),
      explanation: L(
        `A rail line is about ${round(rail.distance)} m from ${c.name}. Work near a railway needs the railway's approval, flagging and insurance; allow time for it.`,
        `Une voie ferrée est à environ ${round(rail.distance)} m de ${c.name}. Les travaux près d'un chemin de fer exigent l'approbation de la compagnie; prévoyez du temps.`,
      ),
      componentIds: [c.id],
      location: loc(rail.at),
    });
  }

  for (const kind of ["school", "hospital"] as const) {
    const near = nearest(shape, of(kind));
    if (!near || near.distance > SITE_DISTANCE_M[kind]) continue;
    const name =
      near.feature.name ?? (kind === "school" ? "A school" : "A hospital");
    out.push({
      code: kind === "school" ? "near_school" : "near_hospital",
      severity: "warning",
      title:
        kind === "school"
          ? L("School within 200 m", "École à moins de 200 m")
          : L("Hospital within 200 m", "Hôpital à moins de 200 m"),
      explanation:
        kind === "school"
          ? L(
              `${name} is about ${round(near.distance)} m from ${c.name}. Plan traffic management and restricted work hours around school times.`,
              `${name} est à environ ${round(near.distance)} m de ${c.name}. Prévoyez la gestion de la circulation et des heures de travail restreintes.`,
            )
          : L(
              `${name} is about ${round(near.distance)} m from ${c.name}. Keep emergency access open at all times and expect noise and vibration limits.`,
              `${name} est à environ ${round(near.distance)} m de ${c.name}. Maintenez l'accès d'urgence et prévoyez des limites de bruit.`,
            ),
      componentIds: [c.id],
      location: loc(near.at),
    });
  }

  const flood = nearest(shape, of("floodplain"));
  if (flood && flood.distance <= SITE_DISTANCE_M.floodplain) {
    out.push({
      code: "floodplain",
      severity: "warning",
      title: L("In a floodplain", "Dans une plaine inondable"),
      explanation: L(
        `${c.name} is inside a mapped floodplain. Expect conservation authority review; buildings may need floodproofing or may not be permitted.`,
        `${c.name} est dans une plaine inondable cartographiée. Prévoyez un examen de l'office de protection de la nature.`,
      ),
      componentIds: [c.id],
      location: loc(flood.at),
    });
  }
  return out;
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
