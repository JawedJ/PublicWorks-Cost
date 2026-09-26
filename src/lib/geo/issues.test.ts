import { describe, expect, it } from "vitest";
import type { Component, Flag, Position, SiteContext } from "@/lib/schemas";
import { issueHighlights } from "./issues";
import { localFrame } from "./transform";

const origin: Position = [-80.5, 43.5];
const { fromLocal } = localFrame(origin);
const sq = (x: number, y: number, s: number) =>
  [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
    [x, y],
  ].map((p) => fromLocal(p as [number, number]));

const park = {
  id: "p",
  type: "park",
  subtype: "neighbourhood_park",
  name: "Park",
  visible: true,
  params: {},
  paramMeta: {},
  geometry: {
    primary: {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [sq(0, 0, 100)] },
    },
    features: [],
  },
} as unknown as Component;

const site: SiteContext = {
  source: "overpass",
  fetchedAt: "2026-09-26T12:00:00Z",
  features: [
    {
      id: "creek",
      kind: "waterway",
      name: "Laurel Creek",
      geometry: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [fromLocal([120, -2000]), fromLocal([120, 2000])],
        },
      },
    },
    {
      id: "house",
      kind: "building",
      tags: { building: "house" },
      geometry: {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [sq(40, 40, 10)] },
      },
    },
  ],
};

const flag = (code: string): Flag =>
  ({
    id: code,
    code,
    severity: "high",
    title: { en: code, fr: code },
    explanation: { en: "x", fr: "x" },
    componentIds: ["p"],
  }) as Flag;

describe("issueHighlights", () => {
  it("links a component to the creek with the distance, showing only the nearby stretch", () => {
    const out = issueHighlights([park], [flag("near_waterway")], site);
    const link = out.find((f) => f.properties.role === "link")!;
    expect(link.properties.label).toBe("Laurel Creek · 20 m");
    const line = out.find((f) => f.properties.role === "line")!;
    expect(
      (line.geometry as { coordinates: Position[] }).coordinates.length,
    ).toBe(2);
  });

  it("outlines the existing buildings in the way", () => {
    const out = issueHighlights(
      [park],
      [flag("existing_buildings_demolished")],
      site,
    );
    expect(out.filter((f) => f.properties.role === "area")).toHaveLength(1);
  });
});
