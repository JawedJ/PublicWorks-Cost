import { describe, expect, it } from "vitest";
import type { Component, Position } from "@/lib/schemas";
import { pointInRing } from "./edit";
import {
  generateLayout,
  PLANNED_FEATURES_PARAM,
  smartGeometry,
  withPlannedFeatures,
} from "./generate";
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

describe("withPlannedFeatures", () => {
  const centre: Position = [-80.5, 43.47];
  const params = { [PLANNED_FEATURES_PARAM]: "playground,splash_pad,plaza" };

  it("places the prompt's park features inside the park", () => {
    const park = make("p", "park", "neighbourhood_park", params);
    const g = withPlannedFeatures(park, smartGeometry(park, centre));
    expect(g.features.map((f) => f.kind)).toEqual([
      "playground",
      "splash_pad",
      "plaza",
    ]);
    const ring = (g.primary.geometry as { coordinates: Position[][] })
      .coordinates[0]!;
    for (const f of g.features)
      for (const p of (f.geometry.geometry as { coordinates: Position[][] })
        .coordinates[0]!)
        expect(pointInRing(p, ring)).toBe(true);
  });

  it("leaves parks with placed features and other types alone", () => {
    const park = make("p", "park", "neighbourhood_park", params);
    const once = withPlannedFeatures(park, smartGeometry(park, centre));
    expect(withPlannedFeatures(park, once)).toBe(once);
    const road = make("r", "road", "road_reconstruction", params);
    const g = smartGeometry(road, centre);
    expect(withPlannedFeatures(road, g)).toBe(g);
  });
});
