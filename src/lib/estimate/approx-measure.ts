import type {
  Measurements,
  Position,
  Project,
  ProjectMeasurements,
} from "@/lib/schemas";

// TEMPORARY: rough local measurements (equirectangular projection) so the estimate
// works before Person A's `measureProject` (src/lib/geo/measure.ts, P1.14) lands.
// Replace the import in useEstimate.ts with A's version when it's on main.

const M_PER_DEG = 111_320;
const xy = ([lng, lat]: Position, lat0: number) => [
  lng * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180),
  lat * M_PER_DEG,
];
const lineLength = (coords: Position[]) =>
  coords.slice(1).reduce((s, c, i) => {
    const [x1, y1] = xy(coords[i]!, c[1]);
    const [x2, y2] = xy(c, c[1]);
    return s + Math.hypot(x2! - x1!, y2! - y1!);
  }, 0);
const ringArea = (ring: Position[]) => {
  const pts = ring.map((c) => xy(c, ring[0]![1]));
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++)
    a += pts[i]![0]! * pts[i + 1]![1]! - pts[i + 1]![0]! * pts[i]![1]!;
  return Math.abs(a) / 2;
};

export function approxMeasureProject(project: Project): ProjectMeasurements {
  const components: Record<string, Measurements> = {};
  for (const c of project.components) {
    const g = c.geometry;
    if (!g) continue;
    const m: Measurements = { features: {} };
    const geom = g.primary.geometry;
    if (geom.type === "LineString") m.lengthM = lineLength(geom.coordinates);
    if (geom.type === "Polygon") {
      m.areaM2 = ringArea(geom.coordinates[0]!);
      m.perimeterM = lineLength(geom.coordinates[0]!);
    }
    for (const f of g.features) {
      const fg = f.geometry.geometry;
      m.features[f.id] =
        fg.type === "LineString"
          ? { lengthM: lineLength(fg.coordinates) }
          : fg.type === "Polygon"
            ? { areaM2: ringArea(fg.coordinates[0]!) }
            : {};
    }
    if (g.sections) {
      m.sections = {};
      for (const s of g.sections) {
        const ring = s.footprint.geometry.coordinates[0]!;
        const fp = ringArea(ring);
        m.sections[s.id] = {
          footprintM2: fp,
          perimeterM: lineLength(ring),
          grossFloorAreaM2: fp * s.storeys,
        };
      }
    }
    if (m.sections)
      m.grossFloorAreaM2 = Object.values(m.sections).reduce(
        (s, x) => s + x.grossFloorAreaM2,
        0,
      );
    components[c.id] = m;
  }
  return {
    components,
    totals: { roadLengthM: 0, parkAreaM2: 0, buildingGfaM2: 0 },
  };
}
