import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { northgateProject } from "@/lib/fixtures";
import { measureProject as measure } from "@/lib/geo/measure";
import type { Component, Position, SiteContext } from "@/lib/schemas";
import { computeEstimate } from "..";
import { siteAllowances, siteProximity } from "../site";
import { makeComponent } from "./helpers";

// A 100 m × 100 m park at the origin of a small local frame near Waterloo.
const LAT = 43.5;
const M_LAT = 1 / 111_320;
const M_LNG = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180));
const at = (xM: number, yM: number): Position => [
  -80.5 + xM * M_LNG,
  LAT + yM * M_LAT,
];

function park(): Component {
  const ring = [at(0, 0), at(100, 0), at(100, 100), at(0, 100), at(0, 0)];
  return {
    ...makeComponent("park", "neighbourhood_park"),
    geometry: {
      primary: {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [ring] },
      },
      features: [],
    },
  };
}

function site(
  ...features: {
    kind: "school" | "hospital" | "waterway" | "rail";
    coords: Position | Position[];
    name?: string;
  }[]
): SiteContext {
  return {
    source: "overpass",
    fetchedAt: "2026-09-26T12:00:00Z",
    features: features.map((f, i) => ({
      id: `n/${i}`,
      kind: f.kind,
      name: f.name,
      geometry: {
        type: "Feature",
        properties: {},
        geometry: Array.isArray(f.coords[0])
          ? { type: "LineString", coordinates: f.coords as Position[] }
          : { type: "Point", coordinates: f.coords as Position },
      },
    })),
  };
}

describe("siteProximity", () => {
  it("measures the nearest feature of each kind in metres", () => {
    const p = siteProximity(
      park(),
      site(
        { kind: "school", coords: at(150, 50), name: "Near PS" },
        { kind: "school", coords: at(400, 50) },
        { kind: "rail", coords: [at(-80, -50), at(-80, 200)] },
      ),
    );
    expect(p.school?.distanceM).toBeCloseTo(50, 0);
    expect(p.school?.name).toBe("Near PS");
    expect(p.rail?.distanceM).toBeCloseTo(80, 0);
    expect(p.hospital).toBeUndefined();
  });

  it("is zero when a stream crosses the component or a school is inside it", () => {
    const p = siteProximity(
      park(),
      site(
        { kind: "waterway", coords: [at(-50, 50), at(150, 60)] },
        { kind: "school", coords: at(50, 50) },
      ),
    );
    expect(p.waterway?.distanceM).toBe(0);
    expect(p.school?.distanceM).toBe(0);
  });

  it("finds nothing without site context or when the lookup failed", () => {
    expect(siteProximity(park(), undefined)).toEqual({});
    expect(
      siteProximity(park(), {
        ...site({ kind: "school", coords: at(0, 0) }),
        source: "unavailable",
      }),
    ).toEqual({});
  });
});

describe("siteAllowances", () => {
  const c = park();

  it("adds a sourced allowance line and a flag per nearby feature", () => {
    const { lines, flags } = siteAllowances(
      c,
      {
        school: { distanceM: 40, name: "Near PS" },
        waterway: { distanceM: 10 },
      },
      1_000_000,
      1,
    );
    expect(lines.map((l) => l.id)).toEqual([
      `${c.id}:site-school`,
      `${c.id}:site-waterway`,
    ]);
    expect(lines[0]!.total).toBeCloseTo(20_000); // 2% of direct
    expect(lines[1]!.total).toBeCloseTo(35_000); // 2% + $15k permit
    for (const l of lines) {
      expect(l.quantitySource.en).toContain("m from");
      expect(l.unitPriceSource.en).toContain("Engine allowance");
      expect(l.unitPrice.low).toBeLessThan(l.unitPrice.typical);
      expect(l.unitPrice.high).toBeGreaterThan(l.unitPrice.typical);
    }
    expect(flags.map((f) => f.code)).toEqual(["near_school", "near_waterway"]);
    expect(flags[0]!.explanation.en).toContain("Near PS");
  });

  it("scales lump sums by the region/date factor and ignores far features", () => {
    const { lines, flags } = siteAllowances(
      c,
      {
        rail: { distanceM: 20 },
        school: { distanceM: 400 },
        hospital: { distanceM: 201 },
      },
      0,
      1.2,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.total).toBeCloseTo(30_000);
    expect(flags.map((f) => f.code)).toEqual(["near_rail"]);
  });

  it("only flags a waterway 30–100 m away, without cost", () => {
    const { lines, flags } = siteAllowances(
      c,
      { waterway: { distanceM: 60 } },
      1e6,
      1,
    );
    expect(lines).toEqual([]);
    expect(flags.map((f) => [f.code, f.severity])).toEqual([
      ["waterway_nearby", "info"],
    ]);
  });
});

describe("computeEstimate with site context", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const run = (siteContext?: SiteContext) => {
    const project = { ...structuredClone(northgateProject), siteContext };
    return computeEstimate(project, measure(project), refData, {
      seed: 1,
      now,
      iterations: 500,
    });
  };

  it("prices a school next to the project into the estimate", () => {
    const road = northgateProject.components.find((x) => x.type === "road")!;
    const p0 = (road.geometry!.primary.geometry.coordinates as Position[])[0]!;
    const without = run(undefined);
    const withSchool = run(
      site({ kind: "school", coords: p0, name: "Test PS" }),
    );
    expect(withSchool.directCost).toBeGreaterThan(without.directCost);
    expect(
      withSchool.lineItems.some((l) => l.id === `${road.id}:site-school`),
    ).toBe(true);
    expect(withSchool.flags.some((f) => f.code === "near_school")).toBe(true);
  });
});
