import { describe, expect, it } from "vitest";
import { northgateEstimate as estimate, northgateProject as project } from "..";

const componentIds = new Set(project.components.map((c) => c.id));

describe("Northgate fixtures", () => {
  it("covers every Northgate component type in the project", () => {
    expect(new Set(project.components.map((c) => c.type))).toEqual(
      new Set(["road", "park", "building", "structure", "parking"]),
    );
    expect(project.components.filter((c) => c.type === "road")).toHaveLength(2);
  });

  it("gives every component geometry, and every building its sections", () => {
    for (const c of project.components) {
      expect(c.status).toBe("drawn");
      expect(c.geometry).toBeDefined();
      if (c.type === "building")
        expect(c.geometry?.sections?.length).toBeGreaterThan(0);
    }
  });

  it("estimates each project component exactly once", () => {
    expect(estimate.components.map((c) => c.componentId).sort()).toEqual(
      [...componentIds].sort(),
    );
  });

  it("only references ids that exist in the project", () => {
    const sectionIds = new Set(
      project.components.flatMap(
        (c) => c.geometry?.sections?.map((s) => s.id) ?? [],
      ),
    );
    const featureIds = new Set(
      project.components.flatMap(
        (c) => c.geometry?.features.map((f) => f.id) ?? [],
      ),
    );
    for (const item of estimate.lineItems) {
      if (item.componentId !== null)
        expect(componentIds).toContain(item.componentId);
      if (item.elementRef?.sectionId)
        expect(sectionIds).toContain(item.elementRef.sectionId);
      if (item.elementRef?.featureId)
        expect(featureIds).toContain(item.elementRef.featureId);
    }
    for (const flag of estimate.flags) {
      for (const id of flag.componentIds) expect(componentIds).toContain(id);
    }
  });

  it("adds up: line items, component direct costs, and category subtotals", () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(estimate.lineItems.map((i) => i.total))).toBeCloseTo(
      estimate.directCost,
      0,
    );
    for (const c of estimate.components) {
      const items = estimate.lineItems.filter(
        (i) => i.componentId === c.componentId,
      );
      expect(sum(items.map((i) => i.total))).toBeCloseTo(c.directCost, 0);
    }
    expect(sum(Object.values(estimate.subtotals))).toBeCloseTo(
      estimate.directCost,
      0,
    );
  });

  it("keeps percentiles ordered", () => {
    const d = estimate.distribution;
    expect(d.p10).toBeLessThan(d.p50);
    expect(d.p50).toBeLessThan(d.p80);
    expect(d.p80).toBeLessThan(d.p90);
    for (const c of estimate.components) {
      expect(c.p10).toBeLessThan(c.p50);
      expect(c.p50).toBeLessThan(c.p90);
    }
  });
});
