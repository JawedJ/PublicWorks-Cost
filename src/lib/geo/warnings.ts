import type { Component, PolygonFeature, Position } from "@/lib/schemas";
import { pointInRing } from "./edit";
import { measureComponent } from "./measure";

// Advisory cross-component warnings (SPEC 6, P1.16). Never blocking and never
// part of the estimate: they point at likely drawing mistakes.

export type DesignWarning = {
  id: string;
  code:
    | "overlap"
    | "featureOutside"
    | "outsideArea"
    | "tallBuilding"
    | "longRoad"
    | "tinyPark";
  componentIds: string[];
  location: Position;
  /** Values for the message, e.g. the other component's name. */
  values: Record<string, string | number>;
};

type Ring = Position[];

function outerRings(c: Component): Ring[] {
  const g = c.geometry;
  if (!g) return [];
  if (c.type === "building" && g.sections?.length)
    return g.sections.map((s) => s.footprint.geometry.coordinates[0]!);
  return g.primary.geometry.type === "Polygon"
    ? [g.primary.geometry.coordinates[0]!]
    : [];
}

function segmentsCross(a: Position, b: Position, c: Position, d: Position) {
  const o = (p: Position, q: Position, r: Position) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** True if two rings overlap (a vertex inside the other, or edges crossing). */
export function ringsOverlap(a: Ring, b: Ring): boolean {
  if (a.some((p) => pointInRing(p, b)) || b.some((p) => pointInRing(p, a)))
    return true;
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++)
      if (segmentsCross(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
  return false;
}

function mid(ring: Ring): Position {
  const pts = ring.slice(0, -1);
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

function allPositions(c: Component): Position[] {
  const g = c.geometry;
  if (!g) return [];
  const out: Position[] = [];
  const add = (coords: unknown) => {
    if (typeof (coords as number[])[0] === "number")
      out.push(coords as Position);
    else (coords as unknown[]).forEach(add);
  };
  add(g.primary.geometry.coordinates);
  g.sections?.forEach((s) => add(s.footprint.geometry.coordinates));
  g.features.forEach((f) => add(f.geometry.geometry.coordinates));
  return out;
}

const MULTI_STOREY_OK = ["mid_rise_apartment", "hospital", "municipal_office"];

export function designWarnings(
  components: Component[],
  area: PolygonFeature | null,
): DesignWarning[] {
  const out: DesignWarning[] = [];
  const drawn = components.filter((c) => c.geometry && c.visible);

  // Buildings and parks overlapping each other.
  const solids = drawn.filter(
    (c) => c.type === "building" || c.type === "park",
  );
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!;
      const b = solids[j]!;
      // A building inside a park (e.g. a pavilion) is fine; flag building–building overlaps and partial park overlaps.
      if (a.type === "park" && b.type === "park") continue;
      const hit = outerRings(a).find((ra) =>
        outerRings(b).some((rb) => ringsOverlap(ra, rb)),
      );
      if (hit)
        out.push({
          id: `overlap:${a.id}:${b.id}`,
          code: "overlap",
          componentIds: [a.id, b.id],
          location: mid(hit),
          values: { a: a.name, b: b.name },
        });
    }

  for (const c of drawn) {
    const g = c.geometry!;
    // Park features outside the park.
    if (c.type === "park" && g.primary.geometry.type === "Polygon") {
      const ring = g.primary.geometry.coordinates[0]!;
      for (const f of g.features) {
        const pts: Position[] = [];
        const add = (coords: unknown) => {
          if (typeof (coords as number[])[0] === "number")
            pts.push(coords as Position);
          else (coords as unknown[]).forEach(add);
        };
        add(f.geometry.geometry.coordinates);
        const outside = pts.find((p) => !pointInRing(p, ring));
        if (outside)
          out.push({
            id: `featureOutside:${c.id}:${f.id}`,
            code: "featureOutside",
            componentIds: [c.id],
            location: outside,
            values: { name: c.name },
          });
      }
    }
    // Outside the project area.
    if (area) {
      const outside = allPositions(c).find(
        (p) => !pointInRing(p, area.geometry.coordinates[0]!),
      );
      if (outside)
        out.push({
          id: `outsideArea:${c.id}`,
          code: "outsideArea",
          componentIds: [c.id],
          location: outside,
          values: { name: c.name },
        });
    }
    // Unusual values.
    const m = measureComponent(c);
    const at = allPositions(c)[0]!;
    if (c.type === "building") {
      const top = Math.max(...(g.sections ?? []).map((s) => s.storeys), 0);
      if (top > (MULTI_STOREY_OK.includes(c.subtype) ? 30 : 12))
        out.push({
          id: `tall:${c.id}`,
          code: "tallBuilding",
          componentIds: [c.id],
          location: at,
          values: { name: c.name, storeys: top },
        });
    }
    if (c.type === "road" && (m.lengthM ?? 0) > 5000)
      out.push({
        id: `long:${c.id}`,
        code: "longRoad",
        componentIds: [c.id],
        location: at,
        values: { name: c.name, km: Math.round((m.lengthM ?? 0) / 100) / 10 },
      });
    if (c.type === "park" && m.areaM2 !== undefined && m.areaM2 < 300)
      out.push({
        id: `tiny:${c.id}`,
        code: "tinyPark",
        componentIds: [c.id],
        location: at,
        values: { name: c.name, m2: Math.round(m.areaM2) },
      });
  }
  return out;
}
