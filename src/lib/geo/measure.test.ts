import { describe, expect, it } from "vitest";
import { northgateProject } from "@/lib/fixtures";
import type { Component, PolygonFeature, Position } from "@/lib/schemas";
import { measureComponent, measureProject } from "./measure";
import { localFrame } from "./transform";

const { fromLocal } = localFrame([-80.5, 43.45]);
const box = (w: number, h: number, hole?: number): PolygonFeature => {
  const r = (x0: number, y0: number, x1: number, y1: number): Position[] => [
    fromLocal([x0, y0]),
    fromLocal([x1, y0]),
    fromLocal([x1, y1]),
    fromLocal([x0, y1]),
    fromLocal([x0, y0]),
  ];
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: hole
        ? [r(0, 0, w, h), r(1, 1, 1 + hole, 1 + hole)]
        : [r(0, 0, w, h)],
    },
  };
};
const base = {
  subtype: "x",
  status: "drawn" as const,
  origin: "user" as const,
  params: {},
  paramMeta: {},
  overrides: { quantities: {}, unitPrices: {} },
  visible: true,
};

describe("measure", () => {
  it("measures a road's length", () => {
    const road: Component = {
      ...base,
      id: "r",
      name: "R",
      type: "road",
      geometry: {
        primary: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [fromLocal([0, 0]), fromLocal([300, 400])],
          },
        },
        features: [],
      },
    };
    expect(measureComponent(road).lengthM).toBeCloseTo(500, -1);
  });

  it("measures area with holes subtracted, perimeter, and building GFA per section", () => {
    const b: Component = {
      ...base,
      id: "b",
      name: "B",
      type: "building",
      geometry: {
        primary: box(40, 40),
        sections: [
          { id: "a", footprint: box(20, 10), storeys: 2, roof: "flat" },
          { id: "c", footprint: box(10, 10, 5), storeys: 6, roof: "flat" },
        ],
        features: [],
      },
    };
    const m = measureComponent(b);
    expect(m.areaM2).toBeCloseTo(1600, -1);
    expect(m.perimeterM).toBeCloseTo(160, 0);
    expect(m.sections!.a!.grossFloorAreaM2).toBeCloseTo(400, -1);
    expect(m.sections!.c!.footprintM2).toBeCloseTo(75, -1);
    expect(m.footprintM2).toBeCloseTo(275, -1);
    expect(m.grossFloorAreaM2).toBeCloseTo(400 + 450, -1);
  });

  it("totals the sample project", () => {
    const pm = measureProject(northgateProject);
    expect(Object.keys(pm.components)).toHaveLength(
      northgateProject.components.filter((c) => c.geometry).length,
    );
    expect(pm.totals.roadLengthM).toBeGreaterThan(100);
    expect(pm.totals.parkAreaM2).toBeGreaterThan(1000);
    expect(pm.totals.buildingGfaM2).toBeGreaterThan(500);
  });
});
