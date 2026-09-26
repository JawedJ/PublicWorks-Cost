import { describe, expect, it } from "vitest";
import { resolveParams } from "../params";

import { buildingTemplate } from "../templates/building";
import { byId, makeCtx, missingPrices } from "./helpers";

const square = {
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ] as [number, number][][],
  },
};

function derive(subtype: string, params = {}, siteAreaM2 = 5000) {
  const ctx = makeCtx(
    buildingTemplate,
    subtype,
    {
      areaM2: siteAreaM2,
      sections: {
        a: { footprintM2: 1000, perimeterM: 130, grossFloorAreaM2: 2000 },
        b: { footprintM2: 400, perimeterM: 80, grossFloorAreaM2: 400 },
      },
    },
    params,
  );
  ctx.component.geometry = {
    primary: square,
    sections: [
      { id: "a", footprint: square, storeys: 2, roof: "flat" },
      { id: "b", footprint: square, storeys: 1, roof: "green" },
    ],
    features: [],
  };
  return { ctx, lines: buildingTemplate.deriveQuantities(ctx) };
}

describe("building template (SPEC 6.3)", () => {
  it("prices each section's GFA and the site works", () => {
    const q = byId(derive("library").lines);
    expect(q["section:a"]!.quantity).toBe(2000);
    expect(q["section:b"]!.quantity).toBe(400);
    expect(q["roof:b"]!.quantity).toBe(400);
    expect(q.shape_complexity).toBeDefined();
    // No parking by default: parking lots are their own component.
    expect(q.parking).toBeUndefined();
    expect(q.landscaping!.quantity).toBe(5000 - 1400);
    expect(missingPrices(derive("library").lines)).toEqual([]);
  });

  it("adds special spaces and scales to a GFA override", () => {
    const q = byId(derive("fire_station", { gfaOverrideM2: 4800 }).lines);
    expect(q["special:apparatus_bay"]!.quantity).toBe(3);
    expect(q["section:a"]!.quantity).toBe(4000);
  });

  it("flags program-driven cost and a site that's too small", () => {
    const { ctx } = derive("school", {}, 1300); // footprint 1,400 m²
    const codes = buildingTemplate.flags(ctx).map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining(["program_driven_cost", "building_does_not_fit"]),
    );
  });
});

describe("building amenity defaults", () => {
  it("are off for every subtype unless specified", () => {
    const amenities = [
      "gymnasium",
      "indoorPool",
      "iceRink",
      "commercialKitchen",
      "sallyPort",
      "councilChamber",
    ];
    for (const { id } of buildingTemplate.subtypes) {
      const p = resolveParams(buildingTemplate, id, {});
      for (const a of amenities) expect(p[a], `${id}.${a}`).toBe(false);
    }
  });
});
