import { describe, expect, it } from "vitest";
import { regionalFactors, statcanBcpi } from "@/data";

const find = (geo: string, type: string, division: string) =>
  statcanBcpi.series.find(
    (s) => s.geo === geo && s.type === type && s.division === division,
  );

describe("statcan-bcpi.json", () => {
  it("records its source, licence, and retrieval date", () => {
    expect(statcanBcpi.source.tableId).toBe("18-10-0289-01");
    expect(statcanBcpi.source.base).toBe("2023=100");
    expect(Date.parse(statcanBcpi.source.retrievedAt)).not.toBeNaN();
  });

  it("covers the Ontario CMAs and the composite", () => {
    expect(statcanBcpi.geographies.map((g) => g.key).sort()).toEqual([
      "composite",
      "london",
      "ottawa",
      "toronto",
    ]);
  });

  it("has the composite series the engine uses in every geography", () => {
    for (const geo of statcanBcpi.geographies) {
      for (const type of ["non_residential", "institutional", "residential"]) {
        expect(
          find(geo.key, type, "composite"),
          `${geo.key} ${type}`,
        ).toBeDefined();
      }
    }
  });

  it("has points oldest first, with at least 9 quarters for the trailing trend", () => {
    for (const s of statcanBcpi.series) {
      const periods = s.points.map(([q]) => q);
      expect(periods).toEqual([...periods].sort());
    }
    expect(
      find("toronto", "non_residential", "composite")!.points.length,
    ).toBeGreaterThanOrEqual(9);
  });

  it("averages about 100 over 2023 (the base year)", () => {
    const s = find("composite", "non_residential", "composite")!;
    const y2023 = s.points
      .filter(([q]) => q.startsWith("2023"))
      .map(([, v]) => v);
    expect(y2023).toHaveLength(4);
    const avg = y2023.reduce((a, b) => a + b, 0) / 4;
    expect(avg).toBeGreaterThan(97);
    expect(avg).toBeLessThan(103);
  });

  it("has a series for every region's reference CMA", () => {
    const geos = new Set(statcanBcpi.geographies.map((g) => g.key));
    for (const r of regionalFactors.regions) {
      expect(geos.has(r.referenceCma), `${r.key} → ${r.referenceCma}`).toBe(
        true,
      );
    }
  });
});
