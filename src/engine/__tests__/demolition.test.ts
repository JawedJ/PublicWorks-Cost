import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { measureProject as measure } from "@/lib/geo/measure";
import type { Component, Position, SiteContext } from "@/lib/schemas";
import { northgateProject } from "@/lib/fixtures";
import { computeEstimate } from "..";
import { existingBuildingsOn } from "../demolition";
import { makeComponent } from "./helpers";

const LAT = 43.5;
const at = (x: number, y: number): Position => [
  -80.5 + x / (111_320 * Math.cos((LAT * Math.PI) / 180)),
  LAT + y / 111_320,
];
const square = (x: number, y: number, s: number) => [
  at(x, y),
  at(x + s, y),
  at(x + s, y + s),
  at(x, y + s),
  at(x, y),
];

function parkingLot(): Component {
  return {
    ...makeComponent("parking", "surface_lot"),
    geometry: {
      primary: {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [square(0, 0, 60)] },
      },
      features: [],
    },
  };
}

// Two 10 × 10 m buildings on the lot (one 3 storeys, one untagged house) and one outside it.
const site: SiteContext = {
  source: "overpass",
  fetchedAt: "2026-09-26T12:00:00Z",
  features: (
    [
      {
        x: 10,
        tags: { building: "yes", "building:levels": "3" },
        name: "Old Depot",
      },
      { x: 40, tags: { building: "house" } },
      { x: 200, tags: { building: "yes" } },
    ] as { x: number; tags: Record<string, string>; name?: string }[]
  ).map((b, i) => ({
    id: `way/${i}`,
    kind: "building" as const,
    name: b.name,
    tags: b.tags,
    geometry: {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [square(b.x, 10, 10)],
      },
    },
  })),
};

describe("existing buildings in the way", () => {
  it("finds buildings on the site with floor area from their storeys", () => {
    const e = existingBuildingsOn(parkingLot(), site);
    expect(e.count).toBe(2);
    expect(e.footprintM2).toBeCloseTo(200, -1);
    // 100 m² × 3 storeys + 100 m² × 2 (house default)
    expect(e.floorAreaM2).toBeCloseTo(500, -1);
    expect(e.names).toEqual(["Old Depot"]);
  });

  const run = (lot: Component) => {
    const project = {
      ...northgateProject,
      components: [lot],
      siteContext: site,
    };
    return computeEstimate(project, measure(project), refData, {
      seed: 1,
      now: new Date("2026-09-26"),
      iterations: 200,
    });
  };

  it("prices demolition and abatement, and flags it", () => {
    const est = run(parkingLot());
    const demo = est.lineItems.find((l) =>
      l.id.endsWith(":existing_demolition"),
    );
    expect(demo?.quantity).toBeCloseTo(500, -1);
    expect(est.lineItems.some((l) => l.id.endsWith(":existing_hazmat"))).toBe(
      true,
    );
    expect(
      est.flags.some((f) => f.code === "existing_buildings_demolished"),
    ).toBe(true);
  });

  it("keeps them when the user says so, with a warning instead", () => {
    const lot = parkingLot();
    const est = run({
      ...lot,
      params: { ...lot.params, demolishExisting: false },
    });
    expect(est.lineItems.some((l) => l.id.includes("existing_"))).toBe(false);
    expect(est.flags.some((f) => f.code === "existing_buildings_kept")).toBe(
      true,
    );
  });
});
