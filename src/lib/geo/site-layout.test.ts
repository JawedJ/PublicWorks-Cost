import { describe, expect, it } from "vitest";
import type { Component, Position } from "@/lib/schemas";
import { generateLayout, pickProjectArea } from "./generate";
import type { Surroundings } from "./site-layout";
import { localFrame } from "./transform";

const centre: Position = [-80.52, 43.47];
const { fromLocal, toLocal } = localFrame(centre);
const line = (pts: [number, number][]) => pts.map(fromLocal);
const box = (x0: number, y0: number, x1: number, y1: number) =>
  line([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]);

// A street grid: an arterial east–west, two local streets north–south, a creek
// crossing the arterial at x = 250, and a block of existing houses north of the arterial.
const surroundings: Surroundings = {
  streets: [
    {
      line: line([
        [-600, 0],
        [0, 0],
      ]),
      kind: "arterial",
    },
    {
      line: line([
        [0, 0],
        [600, 0],
      ]),
      kind: "arterial",
    },
    {
      line: line([
        [-150, -500],
        [-150, 500],
      ]),
      kind: "local",
    },
    {
      line: line([
        [150, -500],
        [150, 500],
      ]),
      kind: "local",
    },
  ],
  blocked: [box(-140, 15, 140, 200)],
  waterways: [
    line([
      [250, -500],
      [250, 500],
    ]),
  ],
  keepClear: [],
};

const make = (
  id: string,
  type: Component["type"],
  subtype: string,
  params: Component["params"] = {},
) => ({ id, type, subtype, params });

const ringOf = (g: { primary: { geometry: unknown } }) =>
  (g.primary.geometry as { coordinates: Position[][] }).coordinates[0]!.map(
    toLocal,
  );

describe("map-aware layout", () => {
  const list = [
    make("r1", "road", "road_reconstruction", { roadClass: "arterial" }),
    make("b1", "building", "library"),
    make("k1", "parking", "surface_lot"),
    make("s1", "structure", "culvert_replacement"),
    make("p1", "park", "neighbourhood_park"),
  ];
  const out = generateLayout(list, centre, 3, surroundings);

  it("puts road work on an existing street of the right class", () => {
    const pts = (
      out.r1!.primary.geometry as { coordinates: Position[] }
    ).coordinates.map(toLocal);
    for (const [, y] of pts) expect(Math.abs(y)).toBeLessThan(0.5);
  });

  it("keeps new plots off existing buildings and streets", () => {
    for (const id of ["b1", "k1", "p1"]) {
      const ring = ringOf(out[id]!);
      // Not inside the existing house block.
      for (const [x, y] of ring)
        expect(x > -140 && x < 140 && y > 15 && y < 200).toBe(false);
      // Clear of the arterial (half width 12 m).
      const ys = ring.map((p) => p[1]);
      expect(Math.min(...ys) > 12 || Math.max(...ys) < -12).toBe(true);
    }
  });

  it("puts the culvert where a road crosses the creek", () => {
    const [x, y] = toLocal(
      (out.s1!.primary.geometry as { coordinates: Position }).coordinates,
    );
    expect(Math.abs(x - 250)).toBeLessThan(1);
    expect(Math.abs(y)).toBeLessThan(1);
  });

  it("is deterministic for a seed", () => {
    const strip = (x: object) => JSON.stringify(x).replace(/"id":"[^"]+"/g, "");
    expect(strip(generateLayout(list, centre, 3, surroundings))).toEqual(
      strip(out),
    );
  });
});

describe("project area", () => {
  // Streets every 200 m both ways; the west half is built up, a park sits
  // north-east, and open land zoned open space lies south-east.
  const grid: Surroundings = {
    streets: [-400, -200, 0, 200, 400].flatMap((k) => [
      {
        line: line([
          [-700, k],
          [700, k],
        ]),
        kind: "local" as const,
      },
      {
        line: line([
          [k, -700],
          [k, 700],
        ]),
        kind: "local" as const,
      },
    ]),
    blocked: [
      ...[-650, -550, -450, -350, -250, -150, -50].flatMap((x) =>
        [
          -650, -550, -450, -350, -250, -150, -50, 50, 150, 250, 350, 450, 550,
        ].map((y) => box(x, y, x + 60, y + 60)),
      ),
    ],
    parks: [box(20, 20, 380, 380)],
    preferred: [box(20, -380, 380, -20)],
    waterways: [],
    keepClear: [],
  };
  const list = [
    make("b1", "building", "library"),
    make("k1", "parking", "surface_lot"),
    make("b2", "building", "fire_station"),
  ];

  it("picks open land zoned open space, not the built-up side or the park", () => {
    const ring = pickProjectArea(list, centre, 1, grid)!;
    const pts = ring.map(toLocal);
    const cx = pts.slice(0, -1).reduce((s, p) => s + p[0], 0) / 4;
    const cy = pts.slice(0, -1).reduce((s, p) => s + p[1], 0) / 4;
    expect(cx).toBeGreaterThan(0);
    expect(cy).toBeLessThan(0);
  });

  it("places everything inside the area it picked", () => {
    const ring = pickProjectArea(list, centre, 1, grid)!;
    const out = generateLayout(list, centre, 1, grid, ring);
    const area = ring.map(toLocal);
    const inside = ([x, y]: [number, number]) => {
      let c = false;
      for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
        const [xi, yi] = area[i]!;
        const [xj, yj] = area[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          c = !c;
      }
      return c;
    };
    for (const id of ["b1", "k1", "b2"])
      for (const p of ringOf(out[id]!)) expect(inside(p)).toBe(true);
  });
});
