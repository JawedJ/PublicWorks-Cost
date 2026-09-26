import { describe, expect, it } from "vitest";
import { northgateProject } from "@/lib/fixtures";
import type { Component, PolygonFeature, Position } from "@/lib/schemas";
import { localFrame } from "./transform";
import { designWarnings } from "./warnings";

const { fromLocal } = localFrame([-80.5, 43.45]);
const box = (x: number, y: number, w: number, h: number): PolygonFeature => {
  const p = (a: number, b: number): Position => fromLocal([a, b]);
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h), p(x, y)],
      ],
    },
  };
};
const building = (id: string, f: PolygonFeature, storeys = 2): Component => ({
  id,
  name: id,
  type: "building",
  subtype: "library",
  status: "drawn",
  origin: "user",
  geometry: {
    primary: f,
    sections: [{ id: `${id}-s`, footprint: f, storeys, roof: "flat" }],
    features: [],
  },
  params: {},
  paramMeta: {},
  overrides: { quantities: {}, unitPrices: {} },
  visible: true,
});

describe("designWarnings", () => {
  it("flags overlapping buildings, tall buildings and components outside the area", () => {
    const w = designWarnings(
      [
        building("a", box(0, 0, 20, 20)),
        building("b", box(10, 10, 20, 20), 40),
      ],
      box(-5, -5, 30, 30),
    );
    const codes = w.map((x) => x.code).sort();
    expect(codes).toEqual(["outsideArea", "overlap", "tallBuilding"]);
  });

  it("finds nothing unusual in the sample project", () => {
    expect(
      designWarnings(
        northgateProject.components,
        northgateProject.areaBoundary ?? null,
      ),
    ).toEqual([]);
  });
});
