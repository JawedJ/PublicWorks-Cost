import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { northgateProject } from "@/lib/fixtures";
import { measureProject as measure } from "@/lib/geo/measure";
import { EstimateSchema } from "@/lib/schemas";
import { computeEstimate } from "..";

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
    computeEstimate(northgateProject, m, refData, {
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
