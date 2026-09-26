import type {
  Component,
  Flag,
  LineItem,
  LineItemCategory,
  LocalizedText,
  Position,
  SiteContext,
} from "@/lib/schemas";
import { L, t } from "./text";

// P6.3: site context → cost allowances and permit flags. Pure: distances are
// computed here from the component's geometry and the looked-up site features
// (schools, hospitals, waterways, rail). Allowances are sample engine rules, shown
// as their own line items with sources, never hidden in unit prices.

type Kind = "school" | "hospital" | "waterway" | "rail";

/** Nearest site feature of each kind, in metres. */
export type SiteProximity = Partial<
  Record<Kind, { distanceM: number; name?: string }>
>;

type XY = [number, number];
type Seg = [XY, XY];

/** Metres per degree at a latitude (equirectangular; fine at site scale). */
function frame(lat: number) {
  const ky = 111_320;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  return (p: Position): XY => [p[0] * kx, p[1] * ky];
}

/** Every ring, line or point of a GeoJSON geometry as point lists. */
function partsOf(g: { type: string; coordinates: unknown }): Position[][] {
  if (g.type === "Point") return [[g.coordinates as Position]];
  if (g.type === "LineString") return [g.coordinates as Position[]];
  if (g.type === "Polygon") return g.coordinates as Position[][];
  return [];
}

function componentParts(c: Component): {
  parts: Position[][];
  polygons: Position[][];
} {
  const g = c.geometry;
  if (!g) return { parts: [], polygons: [] };
  const shapes = [
    g.primary.geometry,
    ...(g.sections ?? []).map((s) => s.footprint.geometry),
    ...g.features.map((f) => f.geometry.geometry),
  ];
  return {
    parts: shapes.flatMap(partsOf),
    polygons: shapes
      .filter((s) => s.type === "Polygon")
      .map((s) => (s.coordinates as Position[][])[0]!),
  };
}

const segments = (pts: XY[]): Seg[] =>
  pts.length === 1
    ? [[pts[0]!, pts[0]!]]
    : pts.slice(1).map((p, i) => [pts[i]!, p]);

function pointSeg(p: XY, [a, b]: Seg): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const u = len2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
    : 0;
  return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
}

const cross = (o: XY, a: XY, b: XY) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segSeg(s: Seg, r: Seg): number {
  const d1 = cross(r[0], r[1], s[0]);
  const d2 = cross(r[0], r[1], s[1]);
  const d3 = cross(s[0], s[1], r[0]);
  const d4 = cross(s[0], s[1], r[1]);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(
    pointSeg(s[0], r),
    pointSeg(s[1], r),
    pointSeg(r[0], s),
    pointSeg(r[1], s),
  );
}

function inRing(p: XY, ring: XY[]): boolean {
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

/** Nearest school, hospital, waterway and rail line to the component, in metres. */
export function siteProximity(
  c: Component,
  site: SiteContext | undefined,
): SiteProximity {
  const out: SiteProximity = {};
  if (!site || site.source === "unavailable") return out;
  const { parts, polygons } = componentParts(c);
  const first = parts[0]?.[0];
  if (!first) return out;
  const toXY = frame(first[1]);
  const compSegs = parts.flatMap((p) => segments(p.map(toXY)));
  const compPolys = polygons.map((r) => r.map(toXY));
  for (const f of site.features) {
    if (
      f.kind !== "school" &&
      f.kind !== "hospital" &&
      f.kind !== "waterway" &&
      f.kind !== "rail"
    )
      continue;
    const featParts = partsOf(f.geometry.geometry).map((p) => p.map(toXY));
    const inside = featParts.some((p) =>
      p.some((q) => compPolys.some((ring) => inRing(q, ring))),
    );
    let d = inside ? 0 : Infinity;
    if (!inside)
      for (const fs of featParts.flatMap(segments))
        for (const cs of compSegs) d = Math.min(d, segSeg(fs, cs));
    const prev = out[f.kind];
    if (!prev || d < prev.distanceM)
      out[f.kind] = { distanceM: d, name: f.name };
  }
  return out;
}

/** Sample rules: within `withinM` of a feature adds a % of direct cost and/or a lump sum. */
const RULES: {
  kind: Kind;
  withinM: number;
  code: string;
  severity: Flag["severity"];
  pct?: number;
  lump?: number;
  category: LineItemCategory;
  description: LocalizedText;
  title: LocalizedText;
  explanation: LocalizedText;
}[] = [
  {
    kind: "school",
    withinM: 200,
    code: "near_school",
    severity: "warning",
    pct: 0.02,
    category: "traffic_control",
    description: L(
      "School zone: pedestrian safety, crossing guards and restricted work hours",
      "Zone scolaire : sécurité des piétons, brigadiers et heures de travail restreintes",
    ),
    title: L("Near a school", "Près d'une école"),
    explanation: L(
      "Work near a school usually needs extra traffic control, safe walking routes and no noisy work at drop-off and pick-up times.",
      "Les travaux près d'une école exigent souvent une signalisation accrue, des trajets piétons sûrs et aucun travail bruyant aux heures d'arrivée et de départ.",
    ),
  },
  {
    kind: "hospital",
    withinM: 200,
    code: "near_hospital",
    severity: "warning",
    pct: 0.015,
    category: "traffic_control",
    description: L(
      "Hospital nearby: emergency access, noise and vibration monitoring",
      "Hôpital à proximité : accès d'urgence, surveillance du bruit et des vibrations",
    ),
    title: L("Near a hospital", "Près d'un hôpital"),
    explanation: L(
      "Ambulance routes must stay open and noise and vibration are usually monitored near a hospital.",
      "Les trajets d'ambulance doivent rester ouverts et le bruit et les vibrations sont généralement surveillés près d'un hôpital.",
    ),
  },
  {
    kind: "waterway",
    withinM: 30,
    code: "near_waterway",
    severity: "high",
    pct: 0.02,
    lump: 15_000,
    category: "site_works",
    description: L(
      "Watercourse: conservation authority permit and enhanced erosion and sediment control",
      "Cours d'eau : permis de l'office de protection de la nature et contrôle renforcé de l'érosion",
    ),
    title: L(
      "Next to a watercourse: permit likely",
      "À côté d'un cours d'eau : permis probable",
    ),
    explanation: L(
      "Work within about 30 m of a river or stream in Ontario usually needs a conservation authority permit, stronger erosion and sediment control, and may face in-water timing windows.",
      "En Ontario, les travaux à moins de 30 m d'une rivière ou d'un ruisseau exigent généralement un permis de l'office de protection de la nature, un contrôle renforcé de l'érosion et parfois des fenêtres de travaux.",
    ),
  },
  {
    kind: "rail",
    withinM: 30,
    code: "near_rail",
    severity: "warning",
    lump: 25_000,
    category: "general",
    description: L(
      "Railway nearby: proximity agreement and flagging protection",
      "Voie ferrée à proximité : entente de proximité et signaleurs",
    ),
    title: L("Next to a railway", "À côté d'une voie ferrée"),
    explanation: L(
      "Work near a rail line needs an agreement with the railway, flagging protection and can be limited to track-time windows.",
      "Les travaux près d'une voie ferrée exigent une entente avec le chemin de fer, des signaleurs et peuvent être limités à des plages horaires.",
    ),
  },
];

/** Waterways within this distance (but outside the permit rule) get an info flag only. */
const WATERWAY_NOTICE_M = 100;

/**
 * Site allowances and flags for one component. `direct` is its direct cost before
 * these lines; `factor` is the region and price-date factor applied to lump sums.
 */
export function siteAllowances(
  c: Component,
  prox: SiteProximity,
  direct: number,
  factor: number,
): { lines: LineItem[]; flags: Omit<Flag, "id">[] } {
  const lines: LineItem[] = [];
  const flags: Omit<Flag, "id">[] = [];
  for (const r of RULES) {
    const near = prox[r.kind];
    if (!near || near.distanceM > r.withinM) continue;
    const typical = (r.pct ?? 0) * direct + (r.lump ?? 0) * factor;
    if (typical <= 0) continue;
    const where = t(
      Math.round(near.distanceM),
      L(" m from ", " m de "),
      near.name ?? L("it", "celui-ci"),
    );
    lines.push({
      id: `${c.id}:site-${r.kind}`,
      componentId: c.id,
      category: r.category,
      description: r.description,
      quantity: 1,
      unit: "lump",
      quantitySource: where,
      unitPrice: { low: typical * 0.5, typical, high: typical * 1.75 },
      unitPriceSource: t(
        L(
          "Engine allowance (sample): ",
          "Provision du moteur (échantillon) : ",
        ),
        ...(r.pct
          ? [r.pct * 100, L("% of direct cost", " % du coût direct")]
          : []),
        r.pct && r.lump ? " + " : "",
        ...(r.lump
          ? [
              "$",
              r.lump,
              L(
                " lump sum, adjusted for region and date",
                " forfait, ajusté pour la région et la date",
              ),
            ]
          : []),
      ),
      priceCategory: "general",
      total: typical,
      isQuantityOverridden: false,
      isPriceOverridden: false,
      lowConfidence: true,
    });
    flags.push({
      code: r.code,
      severity: r.severity,
      title: r.title,
      explanation: t(r.explanation, " ", where, "."),
      costEffect: t("+", L("allowance added", "provision ajoutée")),
      componentIds: [c.id],
    });
  }
  const water = prox.waterway;
  if (
    water &&
    water.distanceM > RULES.find((r) => r.kind === "waterway")!.withinM &&
    water.distanceM <= WATERWAY_NOTICE_M
  ) {
    flags.push({
      code: "waterway_nearby",
      severity: "info",
      title: L("Watercourse nearby", "Cours d'eau à proximité"),
      explanation: t(
        L(
          "A river or stream is within 100 m. Check the conservation authority's regulated area before design; a permit may be needed. ",
          "Une rivière ou un ruisseau se trouve à moins de 100 m. Vérifiez la zone réglementée de l'office de protection de la nature ; un permis peut être requis. ",
        ),
        Math.round(water.distanceM),
        L(" m away.", " m."),
      ),
      componentIds: [c.id],
    });
  }
  return { lines, flags };
}
