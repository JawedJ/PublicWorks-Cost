import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { computeEstimate } from "@/engine";
import { measureProject } from "@/lib/geo/measure";
import { northgateProject as p } from "@/lib/fixtures";
import { benchmarks, comparableAwards, priceTrend } from "./evidence";

describe("market evidence", () => {
  const est = computeEstimate(p, measureProject(p), refData, { seed: 1 });

  it("benchmarks buildings ($/sq ft) and roads ($/m) against Altus", () => {
    const b = benchmarks(est, p.components, null);
    const library = b.find((x) => x.name === "Northgate Branch Library")!;
    expect(library.kind).toBe("building");
    // Building-only rate sits in the Altus library range (regional/BCPI tweaks aside).
    expect(library.position).toBe("within");
    expect(library.allIn!).toBeGreaterThan(library.ours);
    expect(b.some((x) => x.kind === "road" && x.ours > 0)).toBe(true);
    // Scoped to one component, only that one.
    const one = benchmarks(est, p.components, library.componentId);
    expect(one.map((x) => x.componentId)).toEqual([library.componentId]);
  });

  it("gives the BCPI 4-quarter trend for the project's region", () => {
    const tr = priceTrend(p.region)!;
    expect(tr.latest).toMatch(/^\d{4}Q[1-4]$/);
    expect(Math.abs(tr.change)).toBeLessThan(0.3);
  });

  it("matches recent CanadaBuys awards by component type", () => {
    const a = comparableAwards(["road"]);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(
      a.every((x) => x.tags.some((t) => t === "road" || t === "utilities")),
    ).toBe(true);
    expect(comparableAwards(["custom"])).toEqual([]);
  });
});
