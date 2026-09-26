import { describe, expect, it } from "vitest";
import { northgateProject as p } from "@/lib/fixtures";
import type {
  Component,
  Position,
  SiteContext,
  SiteFeature,
} from "@/lib/schemas";
import { shapeDistance, siteParamSuggestions } from "../site-params";

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

describe("road params from the site lookup (P6.3)", () => {
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
