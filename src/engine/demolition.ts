import type {
  Component,
  ParamDefinition,
  Position,
  SiteContext,
} from "@/lib/schemas";
import { bool, num } from "./params";
import { L, t } from "./text";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
  TemplateFlag,
} from "./types";

// Existing buildings in the way. The site lookup brings back OpenStreetMap building
// footprints (with levels where tagged); any that stand on a new building's site,
// park or parking lot are demolished and priced (demolition + hazardous materials
// abatement per m² of floor area) unless the user answers "keep them". Pure.

type XY = [number, number];

/** Asked when existing buildings stand where the component goes. */
export const DEMOLISH_PARAM: ParamDefinition = {
  id: "demolishExisting",
  label: L(
    "Demolish existing buildings on the site",
    "Démolir les bâtiments existants sur le site",
  ),
  type: "boolean",
  default: true,
  costImpact: 4,
  why: L(
    "Existing buildings where this goes must be demolished and cleared of hazardous materials first.",
    "Les bâtiments existants à cet endroit doivent d'abord être démolis et décontaminés.",
  ),
};

/** Typical storey height when OSM gives a height but no level count. */
const STOREY_M = 3.5;
/** Houses are usually two storeys when OSM doesn't say. */
const HOUSE_TYPES = new Set([
  "house",
  "detached",
  "semidetached_house",
  "terrace",
  "residential",
]);

export type ExistingBuildings = {
  count: number;
  footprintM2: number;
  floorAreaM2: number;
  /** Named buildings, for the flag text. */
  names: string[];
};

const frame = (lat: number) => {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  return (p: Position): XY => [p[0] * kx, p[1] * 111_320];
};

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

const cross = (o: XY, a: XY, b: XY) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function ringsCross(a: XY[], b: XY[]): boolean {
  for (let i = 1; i < a.length; i++)
    for (let j = 1; j < b.length; j++) {
      const [p, q, r, s] = [a[i - 1]!, a[i]!, b[j - 1]!, b[j]!];
      if (
        cross(r, s, p) * cross(r, s, q) < 0 &&
        cross(p, q, r) * cross(p, q, s) < 0
      )
        return true;
    }
  return false;
}

function area(ring: XY[]): number {
  let s = 0;
  for (let i = 1; i < ring.length; i++)
    s += ring[i - 1]![0] * ring[i]![1] - ring[i]![0] * ring[i - 1]![1];
  return Math.abs(s) / 2;
}

function storeys(tags: Record<string, string> | undefined): number {
  const levels = Number(tags?.["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) return Math.min(60, levels);
  const height = parseFloat(tags?.height ?? "");
  if (Number.isFinite(height) && height > 0)
    return Math.max(1, Math.min(60, Math.round(height / STOREY_M)));
  return HOUSE_TYPES.has(tags?.building ?? "") ? 2 : 1;
}

/**
 * Existing buildings in the way of a building (its site), park or parking lot: those
 * whose centre is on the component's area, or that a new building section touches.
 */
export function existingBuildingsOn(
  c: Pick<Component, "type" | "geometry">,
  site: SiteContext | undefined,
): ExistingBuildings {
  const none = { count: 0, footprintM2: 0, floorAreaM2: 0, names: [] };
  const g = c.geometry;
  if (!site || !g || g.primary.geometry.type !== "Polygon") return none;
  if (c.type !== "building" && c.type !== "park" && c.type !== "parking")
    return none;
  const toXY = frame(g.primary.geometry.coordinates[0]![0]![1]);
  const outline = g.primary.geometry.coordinates[0]!.map(toXY);
  const sections = (g.sections ?? []).map((s) =>
    s.footprint.geometry.coordinates[0]!.map(toXY),
  );
  const box = (r: XY[]) => [
    Math.min(...r.map((p) => p[0])),
    Math.min(...r.map((p) => p[1])),
    Math.max(...r.map((p) => p[0])),
    Math.max(...r.map((p) => p[1])),
  ];
  const [x0, y0, x1, y1] = box(outline);
  const out: ExistingBuildings = { ...none, names: [] };
  for (const f of site.features) {
    if (f.kind !== "building" || f.geometry.geometry.type !== "Polygon")
      continue;
    const ring = f.geometry.geometry.coordinates[0]!.map(toXY);
    const [bx0, by0, bx1, by1] = box(ring);
    if (bx1! < x0! || bx0! > x1! || by1! < y0! || by0! > y1!) continue;
    const n = ring.length - 1;
    const centre: XY = [
      ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n,
      ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n,
    ];
    const hitsSection = sections.some(
      (s) =>
        ringsCross(s, ring) ||
        s.some((p) => inRing(p, ring)) ||
        ring.some((p) => inRing(p, s)),
    );
    if (!inRing(centre, outline) && !hitsSection) continue;
    const footprint = area(ring);
    out.count += 1;
    out.footprintM2 += footprint;
    out.floorAreaM2 += footprint * storeys(f.tags);
    if (f.name && out.names.length < 3) out.names.push(f.name);
  }
  out.footprintM2 = Math.round(out.footprintM2);
  out.floorAreaM2 = Math.round(out.floorAreaM2);
  return out;
}

/** A building's own "Existing building to demolish" entry takes precedence. */
const manual = (ctx: TemplateContext) =>
  ctx.component.type === "building" && num(ctx.params, "demolitionM2") > 0;

function demolitionLines(ctx: TemplateContext): QuantityLine[] {
  if (manual(ctx) || !bool(ctx.params, "demolishExisting")) return [];
  const e = existingBuildingsOn(ctx.component, ctx.siteContext);
  if (!e.count) return [];
  const src = t(
    e.count,
    L(" existing building(s), ", " bâtiment(s) existant(s), "),
    e.floorAreaM2,
    L(
      " m² floor area (OpenStreetMap footprints × storeys)",
      " m² de plancher (emprises OpenStreetMap × étages)",
    ),
  );
  return [
    {
      localId: "existing_demolition",
      price: { kind: "unitPrice", id: "building_demolition" },
      quantity: e.floorAreaM2,
      unit: "m2",
      quantitySource: src,
    },
    {
      localId: "existing_hazmat",
      price: { kind: "unitPrice", id: "hazmat_abatement" },
      quantity: e.floorAreaM2,
      unit: "m2",
      quantitySource: src,
    },
  ];
}

function demolitionFlags(ctx: TemplateContext): TemplateFlag[] {
  if (manual(ctx)) return [];
  const e = existingBuildingsOn(ctx.component, ctx.siteContext);
  if (!e.count) return [];
  const what = t(
    e.count,
    L(" existing building(s)", " bâtiment(s) existant(s)"),
    e.names.length ? ` (${e.names.join(", ")})` : "",
    L(", about ", ", environ "),
    e.floorAreaM2,
    L(" m² of floor area", " m² de plancher"),
  );
  const keep = !bool(ctx.params, "demolishExisting");
  return [
    keep
      ? {
          code: "existing_buildings_kept",
          severity: "warning",
          title: L(
            "Existing buildings in the way",
            "Bâtiments existants dans l'emprise",
          ),
          explanation: t(
            what,
            L(
              " stand where this goes and are marked to keep. Move it, or allow demolition.",
              " se trouvent à cet endroit et sont conservés. Déplacez l'élément ou autorisez la démolition.",
            ),
          ),
          componentIds: [ctx.component.id],
        }
      : {
          code: "existing_buildings_demolished",
          severity: "info",
          title: L(
            "Existing buildings demolished",
            "Bâtiments existants démolis",
          ),
          explanation: t(
            what,
            L(
              " stand where this goes. Demolition and hazardous materials abatement are priced; a designated substances survey will confirm the abatement.",
              " se trouvent à cet endroit. La démolition et la décontamination sont chiffrées ; une étude des substances désignées confirmera la décontamination.",
            ),
          ),
          costEffect: t("+", L("demolition priced", "démolition chiffrée")),
          componentIds: [ctx.component.id],
        },
  ];
}

/** Adds the "demolish existing buildings" input, lines and flags to a template. */
export function withDemolition(tpl: ComponentTemplate): ComponentTemplate {
  return {
    ...tpl,
    paramCatalog: [...tpl.paramCatalog, DEMOLISH_PARAM],
    deriveQuantities: (ctx) => [
      ...tpl.deriveQuantities(ctx),
      ...demolitionLines(ctx),
    ],
    flags: (ctx) => [...tpl.flags(ctx), ...demolitionFlags(ctx)],
  };
}
