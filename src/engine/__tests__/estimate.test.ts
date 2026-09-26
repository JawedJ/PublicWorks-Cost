import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { northgateProject } from "@/lib/fixtures";
import {
  EstimateSchema,
  type Measurements,
  type Position,
  type Project,
  type ProjectMeasurements,
} from "@/lib/schemas";
import { computeEstimate } from "..";

// Rough local measurements (equirectangular) so the engine can be tested before A's measure.ts.
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

function measure(project: Project): ProjectMeasurements {
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
    components[c.id] = m;
  }
  return {
    components,
    totals: { roadLengthM: 0, parkAreaM2: 0, buildingGfaM2: 0 },
  };
}

const now = new Date("2026-09-26T12:00:00Z");
const run = (project = northgateProject, seed = 42) =>
  computeEstimate(project, measure(project), refData, {
    seed,
    now,
    iterations: 2000,
  });

describe("computeEstimate (Northgate)", () => {
  const e = run();

  it("returns a valid estimate with every drawn component priced", () => {
    expect(EstimateSchema.safeParse(e).success).toBe(true);
    expect(e.components).toHaveLength(
      northgateProject.components.filter((c) => c.status === "drawn").length,
    );
    for (const c of e.components)
      expect(c.directCost, c.name).toBeGreaterThan(0);
  });

  it("builds up from direct cost to a plausible base estimate", () => {
    expect(e.baseEstimate).toBeGreaterThan(e.directCost);
    // Two streets, a park, a library, a fire station, and a culvert: tens of millions.
    expect(e.baseEstimate).toBeGreaterThan(10_000_000);
    expect(e.baseEstimate).toBeLessThan(200_000_000);
    expect(e.lineItems.filter((l) => l.componentId === null)).toHaveLength(1); // one mobilization
  });

  it("has ordered percentiles and a contingency of at least 5%", () => {
    const d = e.distribution;
    expect(d.p10).toBeLessThan(d.p50);
    expect(d.p50).toBeLessThan(d.p80);
    expect(d.p80).toBeLessThan(d.p90);
    expect(e.recommendedContingency.pct).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic for a seed", () => {
    expect(run().distribution).toEqual(e.distribution);
    expect(run(northgateProject, 7).distribution.p50).not.toBe(
      e.distribution.p50,
    );
  });

  it("applies the active scenario", () => {
    const later = run({
      ...northgateProject,
      activeScenarioId: "scn-fire-later",
    });
    expect(
      later.components.some((c) => c.componentId === "c-fire-station"),
    ).toBe(false);
    expect(later.baseEstimate).toBeLessThan(e.baseEstimate);
  });

  it("runs 5,000 iterations fast enough for live updates", () => {
    const m = measure(northgateProject);
    const t0 = performance.now();
    const full = computeEstimate(northgateProject, m, refData, {
      seed: 1,
      now,
    });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
  });

  it("uses BCPI escalation and flags unknown soils", () => {
    expect(e.escalationDetail.bcpiFactor).toBeGreaterThan(1);
    expect(e.flags.map((f) => f.code)).toContain("soil_unknown");
  });
});
