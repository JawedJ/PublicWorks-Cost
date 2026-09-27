import { describe, expect, it } from "vitest";
import { waterlooZoneRules } from "@/data";
import type { Component } from "@/lib/schemas";
import { parseZoneCode, permittedAs, zoneLimitFlags } from "../zoning-limits";

const zones = waterlooZoneRules.zones;
/** Square of `size` metres centred near Waterloo, as a polygon feature. */
function square(size: number, offset = 0) {
  const d = size / 2 / 111_320;
  const kx = 1 / Math.cos((43.47 * Math.PI) / 180);
  const cx = -80.52 + (offset / 111_320) * kx;
  const cy = 43.47;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [cx - d * kx, cy - d],
          [cx + d * kx, cy - d],
          [cx + d * kx, cy + d],
          [cx - d * kx, cy + d],
          [cx - d * kx, cy - d],
        ],
      ],
    },
  };
}
function building(opts: {
  subtype: string;
  lotM: number;
  footprintM: number;
  storeys: number;
  offset?: number;
}): Component {
  return {
    id: "b",
    name: "Test building",
    type: "building",
    subtype: opts.subtype,
    status: "drawn",
    origin: "user",
    visible: true,
    params: {},
    paramMeta: {},
    overrides: { quantities: {}, unitPrices: {} },
    geometry: {
      primary: square(opts.lotM),
      sections: [
        {
          id: "s",
          footprint: square(opts.footprintM, opts.offset ?? 0),
          storeys: opts.storeys,
          roof: "flat",
        },
      ],
      features: [],
    },
  } as unknown as Component;
}
const zone = (code: string) => ({ code, bylaw: "2018-050", city: "Waterloo" });
const codes = (c: Component, code: string) =>
  zoneLimitFlags(c, zone(code)).flags.map((f) => f.code);

describe("Waterloo zone rules (By-law 2018-050)", () => {
  it("parses codes with holding symbols, prefixes and height suffixes", () => {
    expect(parseZoneCode("(H)C7-60", zones)).toEqual({
      base: "C7",
      suffix: 60,
    });
    expect(parseZoneCode("50-R5", zones)).toEqual({ base: "R5" });
    expect(parseZoneCode("RN-12", zones)).toEqual({ base: "RN-12" });
    expect(parseZoneCode("XX-9", zones)).toBeNull();
  });

  it("knows which zones permit a library", () => {
    expect(permittedAs("library", zones.C7!).length).toBeGreaterThan(0);
    expect(permittedAs("library", zones.OS1!).length).toBeGreaterThan(0);
    expect(permittedAs("library", zones.R1!)).toEqual([]);
    expect(permittedAs("fire_station", zones.E1!).length).toBeGreaterThan(0);
  });

  it("passes a modest library in C7-60", () => {
    expect(
      codes(
        building({ subtype: "library", lotM: 80, footprintM: 40, storeys: 2 }),
        "C7-60",
      ),
    ).toEqual([]);
  });

  it("flags use, height, setback and coverage breaches", () => {
    // A library in a detached-house zone, 5 storeys, filling most of its lot.
    const c = building({
      subtype: "library",
      lotM: 40,
      footprintM: 38,
      storeys: 5,
    });
    expect(codes(c, "R1").sort()).toEqual(
      [
        "zoning_coverage",
        "zoning_height",
        "zoning_setback",
        "zoning_use",
      ].sort(),
    );
  });

  it("uses the suffix as the height limit", () => {
    const tall = building({
      subtype: "library",
      lotM: 100,
      footprintM: 40,
      storeys: 7,
    });
    expect(codes(tall, "C7-60")).toEqual([]);
    expect(codes(tall, "U1-20")).toContain("zoning_height"); // 20 m / 6 storeys
  });

  it("flags too little landscaped open space", () => {
    const c = building({
      subtype: "library",
      lotM: 60,
      footprintM: 57,
      storeys: 2,
    });
    expect(codes(c, "C7-60")).toContain("zoning_landscape");
  });
});
