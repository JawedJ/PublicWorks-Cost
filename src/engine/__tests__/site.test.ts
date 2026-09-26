import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { computeEstimate } from "@/engine";
import { measureProject } from "@/lib/geo/measure";
import { northgateProject as p } from "@/lib/fixtures";
import type {
  Component,
  Position,
  SiteContext,
  SiteFeature,
} from "@/lib/schemas";
import { shapeDistance, siteFlags, siteParamSuggestions } from "../site";

const byName = (n: string) => p.components.find((c) => c.name === n)!;
const ctx = (features: SiteContext["features"]): SiteContext => ({
  source: "overpass",
  fetchedAt: "2026-09-26T00:00:00.000Z",
  features,
});

/** A straight road at the component's first point, heading east ~100 m. */
function roadNear(
  c: Component,
  tags: Record<string, string>,
  name?: string,
): SiteFeature {
  const g = c.geometry!.primary.geometry;
  const start =
    g.type === "LineString" ? g.coordinates[0]! : (g.coordinates as number[]);
  return {
    id: "osm-road",
    kind: "road" as const,
    name,
    tags,
    geometry: {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [start[0]!, start[1]!] as Position,
          [start[0]! + 0.0013, start[1]!] as Position,
        ],
      },
    },
  };
}

describe("site context (P6.3)", () => {
  it("measures distance in metres", () => {
    const pt = (lng: number, lat: number) => ({
      points: [[lng, lat] as Position],
      segs: [],
      rings: [],
    });
    // 0.001° latitude ≈ 111 m.
    const d = shapeDistance(pt(-80.5, 43.47), pt(-80.5, 43.471))!;
    expect(d.distance).toBeGreaterThan(105);
    expect(d.distance).toBeLessThan(117);
  });

  it("flags the school near Northgate Avenue from the site lookup", () => {
    const flags = siteFlags(byName("Northgate Avenue"), p.siteContext);
    const school = flags.find((f) => f.code === "near_school");
    expect(school?.explanation.en).toContain("Northgate Public School");
    expect(school?.location).toBeDefined();
  });

  it("the engine adds site flags and doesn't double the culvert permit", () => {
    const e = computeEstimate(p, measureProject(p), refData, { seed: 1 });
    const codes = e.flags.map((f) => f.code);
    expect(codes).toContain("near_school");
    const culvert = byName("Laurel Creek culvert").id;
    const permits = e.flags.filter(
      (f) =>
        f.componentIds.includes(culvert) &&
        (f.code === "in_water_permit" || f.code === "waterway_permit"),
    );
    expect(permits).toHaveLength(1);
  });

  it("flags rail, and nothing without nearby features", () => {
    const road = byName("Northgate Avenue");
    const rail: SiteFeature = {
      ...roadNear(road, {}),
      id: "rail",
      kind: "rail",
    };
    expect(siteFlags(road, ctx([rail])).map((f) => f.code)).toEqual([
      "rail_approval",
    ]);
    const far = siteFlags(road, ctx([]));
    expect(far).toEqual([]);
  });

  it("fills road params from the existing street's OSM tags", () => {
    const road = byName("Library Lane");
    const s = siteParamSuggestions(
      road,
      ctx([
        roadNear(
          road,
          { highway: "tertiary", lanes: "4", sidewalk: "left" },
          "Weber Street",
        ),
      ]),
    );
    expect(Object.fromEntries(s.map((x) => [x.paramId, x.value]))).toEqual({
      lanes: 4,
      roadClass: "collector",
      sidewalkSides: 1,
    });
    expect(s[0]!.evidence).toBe("OpenStreetMap: lanes=4 on Weber Street");
    // Not a road → nothing.
    expect(
      siteParamSuggestions(byName("Northgate Park"), p.siteContext),
    ).toEqual([]);
  });
});
