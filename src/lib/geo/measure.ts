import turfArea from "@turf/area";
import { lineString } from "@turf/helpers";
import turfLength from "@turf/length";
import type {
  AnyFeature,
  Component,
  Measurements,
  Position,
  Project,
  ProjectMeasurements,
} from "@/lib/schemas";

// Measurement API (TEAM.md 3.2): lengths, areas, perimeters, footprints and GFA
// derived from geometry with Turf (geodesic). Never stored; recomputed on change.

const lineM = (coords: Position[]) =>
  coords.length < 2 ? 0 : turfLength(lineString(coords), { units: "meters" });

/** Area in m², holes subtracted. */
export function areaM2(f: AnyFeature): number {
  return f.geometry.type === "Polygon" ? turfArea(f.geometry) : 0;
}

/** Outer boundary length in m. */
export function perimeterM(f: AnyFeature): number {
  return f.geometry.type === "Polygon" ? lineM(f.geometry.coordinates[0]!) : 0;
}

export function lengthM(f: AnyFeature): number {
  return f.geometry.type === "LineString" ? lineM(f.geometry.coordinates) : 0;
}

export function measureComponent(component: Component): Measurements {
  const g = component.geometry;
  const m: Measurements = { features: {} };
  if (!g) return m;
  const primary = g.primary;
  if (primary.geometry.type === "LineString") m.lengthM = lengthM(primary);
  if (primary.geometry.type === "Polygon") {
    m.areaM2 = areaM2(primary);
    m.perimeterM = perimeterM(primary);
  }
  for (const f of g.features) {
    const t = f.geometry.geometry.type;
    m.features[f.id] =
      t === "LineString"
        ? { lengthM: lengthM(f.geometry) }
        : t === "Polygon"
          ? { areaM2: areaM2(f.geometry) }
          : {};
  }
  if (g.sections?.length) {
    m.sections = {};
    let footprint = 0;
    let gfa = 0;
    for (const s of g.sections) {
      const fp = areaM2(s.footprint);
      const sectionGfa = fp * s.storeys;
      m.sections[s.id] = {
        footprintM2: fp,
        perimeterM: perimeterM(s.footprint),
        grossFloorAreaM2: sectionGfa,
      };
      footprint += fp;
      gfa += sectionGfa;
    }
    m.footprintM2 = footprint;
    m.grossFloorAreaM2 = gfa;
  }
  return m;
}

export function measureProject(project: Project): ProjectMeasurements {
  const components: Record<string, Measurements> = {};
  const totals: ProjectMeasurements["totals"] = {
    roadLengthM: 0,
    parkAreaM2: 0,
    buildingGfaM2: 0,
  };
  for (const c of project.components) {
    if (!c.geometry) continue;
    const m = measureComponent(c);
    components[c.id] = m;
    if (c.type === "road") totals.roadLengthM += m.lengthM ?? 0;
    if (c.type === "park") totals.parkAreaM2 += m.areaM2 ?? 0;
    if (c.type === "building") totals.buildingGfaM2 += m.grossFloorAreaM2 ?? 0;
  }
  if (project.areaBoundary)
    totals.areaBoundaryM2 = areaM2(project.areaBoundary);
  return { components, totals };
}
