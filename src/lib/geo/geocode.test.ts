import { describe, expect, it } from "vitest";
import { parseMaptiler, parseNominatim } from "./geocode";

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

  it("parses Nominatim results and reorders the bounding box", () => {
    const out = parseNominatim([
      {
        place_id: 42,
        display_name: "Waterloo, Ontario, Canada",
        lat: "43.46",
        lon: "-80.52",
        boundingbox: ["43.41", "43.53", "-80.62", "-80.47"],
      },
    ]);
    expect(out[0].center).toEqual([-80.52, 43.46]);
    expect(out[0].bbox).toEqual([-80.62, 43.41, -80.47, 43.53]);
  });

  it("rejects malformed responses", () => {
    expect(() => parseMaptiler({ features: [{ id: 1 }] })).toThrow();
  });
});
