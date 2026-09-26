import { describe, expect, it } from "vitest";
import { parseMaptiler, parsePhoton } from "./geocode";

describe("geocode parsers", () => {
  it("parses MapTiler features", () => {
    const out = parseMaptiler({
      type: "FeatureCollection",
      features: [
        {
          id: "municipality.268193",
          place_name: "Kitchener, Ontario, Canada",
          center: [-80.49, 43.45],
          bbox: [-80.57, 43.35, -80.38, 43.51],
          properties: {},
        },
      ],
    });
    expect(out).toEqual([
      {
        id: "municipality.268193",
        label: "Kitchener, Ontario, Canada",
        center: [-80.49, 43.45],
        bbox: [-80.57, 43.35, -80.38, 43.51],
      },
    ]);
  });

  it("parses Photon results: builds labels, reorders the extent, drops duplicates and non-Canadian places", () => {
    const feature = (props: Record<string, unknown>) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-79.37, 43.65] },
      properties: { osm_type: "W", osm_id: 1, ...props },
    });
    const out = parsePhoton({
      type: "FeatureCollection",
      features: [
        feature({
          housenumber: "123",
          street: "Queen Street East",
          city: "Toronto",
          state: "Ontario",
          countrycode: "CA",
          extent: [-79.375, 43.654, -79.373, 43.653],
        }),
        feature({
          osm_id: 2,
          housenumber: "123",
          street: "Queen Street East",
          city: "Toronto",
          state: "Ontario",
          countrycode: "CA",
        }),
        feature({ osm_id: 3, name: "Buffalo", countrycode: "US" }),
        feature({
          osm_id: 4,
          name: "Toronto",
          city: "Toronto",
          state: "Ontario",
        }),
      ],
    });
    expect(out.map((r) => r.label)).toEqual([
      "123 Queen Street East, Toronto, Ontario",
      "Toronto, Ontario",
    ]);
    expect(out[0]!.id).toBe("W1");
    expect(out[0]!.center).toEqual([-79.37, 43.65]);
    expect(out[0]!.bbox).toEqual([-79.375, 43.653, -79.373, 43.654]);
  });

  it("rejects malformed responses", () => {
    expect(() => parseMaptiler({ features: [{ id: 1 }] })).toThrow();
  });
});
