import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { computeEstimate } from "@/engine";
import { northgateProject as project } from "@/lib/fixtures";
import { measureProject } from "@/lib/geo/measure";
import { typicalMonths } from "../duration";

describe("construction time from real contract durations", () => {
  it("grows with cost, less than proportionally", () => {
    const small = typicalMonths("building", 2e6);
    const big = typicalMonths("building", 20e6);
    expect(big).toBeGreaterThan(small);
    expect(big / small).toBeLessThan(10 ** 0.5);
  });

  it("gives buildings longer than civil work of the same value", () => {
    expect(typicalMonths("building", 10e6)).toBeGreaterThan(
      typicalMonths("road", 10e6),
    );
  });

  it("puts a duration on every component and the project schedule on the longest", () => {
    const e = computeEstimate(project, measureProject(project), refData, {
      seed: 1,
    });
    for (const c of e.components) expect(c.durationMonths).toBeGreaterThan(0);
    const longest = Math.max(...e.components.map((c) => c.durationMonths!));
    expect(e.schedule!.months).toBeCloseTo(longest);
    expect(e.schedule!.p10Months).toBeLessThan(e.schedule!.months);
    expect(e.schedule!.p90Months).toBeGreaterThan(e.schedule!.months);
  });
});
