import { describe, expect, it } from "vitest";
import type {
  AnyFeature,
  Component,
  ComponentGeometry,
  PolygonFeature,
  Position,
} from "@/lib/schemas";
import {
  editableElements,
  holeTarget,
  pickElement,
  sharesSite,
  withElementShape,
  withHole,
  withoutElement,
  withPrimaryMoved,
} from "./edit";
import { localFrame } from "./transform";

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
const pt = (x: number, y: number): AnyFeature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Point", coordinates: fromLocal([x, y]) },
});

function building(g: ComponentGeometry): Component {
  return {
    id: "b",
    name: "B",
    type: "building",
    subtype: "library",
    status: "drawn",
    origin: "user",
    geometry: g,
    params: {},
    paramMeta: {},
    overrides: { quantities: {}, unitPrices: {} },
    visible: true,
  };
}

const site = box(0, 0, 40, 40);
const section = (id: string, f: PolygonFeature) => ({
  id,
  footprint: f,
  storeys: 2,
  roof: "flat" as const,
});
const simple: ComponentGeometry = {
  primary: site,
  sections: [section("s1", site), section("s2", box(50, 0, 10, 10))],
  features: [],
};

describe("edit", () => {
  it("treats a building's first section as its site until they differ", () => {
    expect(sharesSite(simple)).toBe(true);
    const refs = editableElements(building(simple)).map((e) => e.ref);
    expect(refs).toEqual([
      { role: "section", id: "s1" },
      { role: "section", id: "s2" },
    ]);
  });

  it("reshaping the linked first section also reshapes the site", () => {
    const next = withElementShape(
      simple,
      { role: "section", id: "s1" },
      box(0, 0, 30, 30),
    )!;
    expect(next.primary).toEqual(next.sections![0]!.footprint);
    expect(sharesSite(next)).toBe(true);
  });

  it("rejects a shape of a different geometry type", () => {
    expect(withElementShape(simple, { role: "primary" }, pt(1, 1))).toBeNull();
  });

  it("moving the primary carries sections and features", () => {
    const park: ComponentGeometry = {
      primary: box(0, 0, 100, 100),
      features: [
        { id: "f", kind: "playground", geometry: pt(10, 10), params: {} },
      ],
    };
    const moved = withPrimaryMoved(park, box(20, 5, 100, 100))!;
    const expected = fromLocal([30, 15]);
    const got = moved.features[0]!.geometry.geometry.coordinates as Position;
    expect(got[0]).toBeCloseTo(expected[0], 9);
    expect(got[1]).toBeCloseTo(expected[1], 9);
  });

  it("adds a hole only when it fits inside the shape", () => {
    const ref = holeTarget(building(simple))!;
    expect(ref).toEqual({ role: "section", id: "s1" });
    const withCourtyard = withHole(simple, ref, box(10, 10, 10, 10))!;
    expect(
      withCourtyard.sections![0]!.footprint.geometry.coordinates,
    ).toHaveLength(2);
    // Linked site gets the courtyard too.
    expect(withCourtyard.primary.geometry.coordinates).toHaveLength(2);
    expect(withHole(simple, ref, box(35, 35, 10, 10))).toBeNull();
    // Overlapping an existing hole is refused.
    expect(withHole(withCourtyard, ref, box(15, 15, 10, 10))).toBeNull();
    expect(withHole(withCourtyard, ref, box(25, 25, 5, 5))).not.toBeNull();
  });

  it("keeps courtyards when only the outline is edited or dragged", () => {
    const ref = { role: "section", id: "s1" } as const;
    const holed = withHole(simple, ref, box(10, 10, 10, 10))!;
    const hole = holed.sections![0]!.footprint.geometry.coordinates[1]!;
    const reshaped = withElementShape(holed, ref, box(0, 0, 45, 45))!;
    expect(reshaped.sections![0]!.footprint.geometry.coordinates[1]).toEqual(
      hole,
    );
    const dragged = withElementShape(holed, ref, box(5, 0, 40, 40), true)!;
    const movedHole = dragged.sections![0]!.footprint.geometry.coordinates[1]!;
    expect(movedHole[0]![0]).toBeCloseTo(fromLocal([15, 10])[0], 9);
    expect(movedHole[0]![1]).toBeCloseTo(hole[0]![1], 9);
  });

  it("removes a section or feature but never the last section", () => {
    const one = withoutElement(simple, { role: "section", id: "s2" })!;
    expect(one.sections).toHaveLength(1);
    expect(withoutElement(one, { role: "section", id: "s1" })).toBeNull();
    expect(withoutElement(simple, { role: "primary" })).toBeNull();
  });

  it("targets a selected polygon feature or section for holes", () => {
    const g: ComponentGeometry = {
      ...simple,
      features: [
        {
          id: "lot",
          kind: "parking",
          geometry: box(0, 50, 20, 20),
          params: {},
        },
        { id: "pin", kind: "washroom", geometry: pt(5, 5), params: {} },
      ],
    };
    const c = building(g);
    expect(holeTarget(c, { featureId: "lot" })).toEqual({
      role: "feature",
      id: "lot",
    });
    expect(holeTarget(c, { featureId: "pin" })).toEqual({
      role: "section",
      id: "s1",
    });
    expect(holeTarget(c, { sectionId: "s2" })).toEqual({
      role: "section",
      id: "s2",
    });
    expect(
      withHole(g, { role: "feature", id: "lot" }, box(5, 55, 5, 5)),
    ).not.toBeNull();
  });

  it("targets a polygon primary for holes when there are no sections", () => {
    const park = building({ primary: box(0, 0, 10, 10), features: [] });
    expect(holeTarget(park)).toEqual({ role: "primary" });
    const road = building({
      primary: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [fromLocal([0, 0]), fromLocal([10, 0])],
        },
      },
      features: [],
    });
    expect(holeTarget(road)).toBeNull();
  });

  it("picks a point, then a line, then the smallest polygon under the pointer", () => {
    const toScreen = (p: Position) => {
      const { toLocal } = localFrame([-80.5, 43.45]);
      return toLocal(p);
    };
    const line: AnyFeature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [fromLocal([0, 30]), fromLocal([40, 30])],
      },
    };
    const elements = [
      { ref: { role: "primary" } as const, shape: box(0, 0, 100, 100) },
      {
        ref: { role: "section", id: "s" } as const,
        shape: box(10, 10, 20, 20),
      },
      { ref: { role: "feature", id: "line" } as const, shape: line },
      { ref: { role: "feature", id: "pin" } as const, shape: pt(50, 50) },
    ];
    const at = (x: number, y: number) =>
      pickElement(elements, fromLocal([x, y]), toScreen, 3);
    expect(at(15, 15)).toEqual({ role: "section", id: "s" });
    expect(at(80, 80)).toEqual({ role: "primary" });
    expect(at(20, 31)).toEqual({ role: "feature", id: "line" });
    expect(at(51, 50)).toEqual({ role: "feature", id: "pin" });
    expect(at(200, 200)).toBeNull();
  });
});
