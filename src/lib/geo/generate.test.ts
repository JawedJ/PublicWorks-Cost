import { describe, expect, it } from "vitest";
import type { Component, Position } from "@/lib/schemas";
import { pointInRing } from "./edit";
import { generateLayout, smartGeometry } from "./generate";
import { measureComponent } from "./measure";

const make = (
  id: string,
  type: Component["type"],
  subtype: string,
  params = {},
): Component => ({
  id,
  name: id,
  type,
  subtype,
  status: "planned",
  origin: "generated",
  params,
  paramMeta: {},
  overrides: { quantities: {}, unitPrices: {} },
  visible: true,
});

describe("generate", () => {
  it("sizes a smart-start library from its GFA and storeys", () => {
    const lib = make("l", "building", "library", {
      gfaOverrideM2: 2400,
      storeys: 2,
    });
    const m = measureComponent({
      ...lib,
      geometry: smartGeometry(lib, [-80.5, 43.45], 20),
    });
    expect(m.footprintM2).toBeCloseTo(1200, -1);
    expect(m.grossFloorAreaM2).toBeCloseTo(2400, -2);
  });

  it("lays out roads, buildings and parks deterministically without overlaps", () => {
    const list = [
      make("r1", "road", "road_reconstruction"),
      make("r2", "road", "road_reconstruction"),
      make("b1", "building", "library"),
      make("b2", "building", "fire_station"),
      make("b3", "building", "community_centre"),
      make("p1", "park", "neighbourhood_park"),
      make("s1", "structure", "culvert_replacement"),
    ];
    const strip = (x: object) => JSON.stringify(x).replace(/"id":"[^"]+"/g, "");
    const a = generateLayout(list, [-80.5, 43.45], 7);
    const b = generateLayout(list, [-80.5, 43.45], 7);
    expect(strip(a)).toEqual(strip(b));
    // Ids inside geometry (sections) are random, so compare shapes only.
    expect(Object.keys(a).sort()).toEqual(list.map((c) => c.id).sort());
    const rings = ["b1", "b2", "b3", "p1"].map(
      (id) =>
        (a[id]!.primary.geometry as { coordinates: Position[][] })
          .coordinates[0]!,
    );
    for (let i = 0; i < rings.length; i++)
      for (let j = 0; j < rings.length; j++)
        if (i !== j)
          expect(rings[i]!.some((p) => pointInRing(p, rings[j]!))).toBe(false);
    expect(strip(generateLayout(list, [-80.5, 43.45], 8))).not.toEqual(
      strip(a),
    );
  });
});
