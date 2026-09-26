import typologies from "@/data/typologies.json";
import type {
  Component,
  ComponentGeometry,
  PolygonFeature,
  Position,
} from "@/lib/schemas";
import { newId } from "./drawing";
import { localFrame } from "./transform";

// Procedural starting shapes (smart start, P1.9) and starting layouts (P1.10).
// Plain deterministic code: sizes come from the component's params (e.g. from the
// prompt) or typologies.json; the layout is seeded so "Regenerate" gives a new one.

type BuildingTypology = {
  gfaM2: number;
  storeys: number;
  aspect: number;
  setbackM: number;
};
type AreaTypology = { areaM2: number; aspect: number };

const T = typologies as unknown as {
  building: Record<string, BuildingTypology>;
  park: Record<string, AreaTypology>;
  road: Record<string, { lengthM: number }>;
  custom: Record<string, AreaTypology>;
};

const DEFAULT_BUILDING: BuildingTypology = {
  gfaM2: 2000,
  storeys: 2,
  aspect: 1.5,
  setbackM: 10,
};
const DEFAULT_AREA: AreaTypology = { areaM2: 10000, aspect: 1.5 };

/** Size hints a component's params may carry (e.g. from the parsed prompt). */
function hint(c: Pick<Component, "params">, id: string): number | undefined {
  const v = c.params[id];
  return typeof v === "number" && v > 0 ? v : undefined;
}

type Size =
  | {
      kind: "rect";
      widthM: number;
      depthM: number;
      storeys?: number;
      setbackM: number;
    }
  | { kind: "line"; lengthM: number }
  | { kind: "point" };

/** Starting size for a component, from its params or its typology. */
export function sizeFor(
  c: Pick<Component, "type" | "subtype" | "params">,
): Size {
  if (c.type === "building") {
    const t = T.building[c.subtype] ?? DEFAULT_BUILDING;
    const storeys = Math.round(hint(c, "storeys") ?? t.storeys);
    const gfa = hint(c, "gfaOverrideM2") ?? hint(c, "gfaM2") ?? t.gfaM2;
    const footprint = gfa / storeys;
    const depthM = Math.sqrt(footprint / t.aspect);
    return {
      kind: "rect",
      widthM: depthM * t.aspect,
      depthM,
      storeys,
      setbackM: t.setbackM,
    };
  }
  if (c.type === "road") {
    return {
      kind: "line",
      lengthM: hint(c, "lengthM") ?? T.road[c.subtype]?.lengthM ?? 400,
    };
  }
  if (c.type === "structure") return { kind: "point" };
  const t =
    (c.type === "park" ? T.park[c.subtype] : T.custom[c.subtype]) ??
    DEFAULT_AREA;
  const area = hint(c, "areaM2") ?? t.areaM2;
  const depthM = Math.sqrt(area / t.aspect);
  return { kind: "rect", widthM: depthM * t.aspect, depthM, setbackM: 5 };
}

/** A rectangle centred on `centre`, rotated `bearingDeg` (counter-clockwise from east). */
function rect(
  centre: Position,
  widthM: number,
  depthM: number,
  bearingDeg: number,
): PolygonFeature {
  const { fromLocal } = localFrame(centre);
  const a = (bearingDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const corners: [number, number][] = [
    [-widthM / 2, -depthM / 2],
    [widthM / 2, -depthM / 2],
    [widthM / 2, depthM / 2],
    [-widthM / 2, depthM / 2],
  ];
  const ring = corners.map(([x, y]) =>
    fromLocal([x * c - y * s, x * s + y * c]),
  );
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
  };
}

/** A procedurally generated starting shape for a known type, centred at `centre`. */
export function smartGeometry(
  c: Pick<Component, "type" | "subtype" | "params">,
  centre: Position,
  bearingDeg = 0,
): ComponentGeometry {
  const size = sizeFor(c);
  if (size.kind === "point")
    return {
      primary: {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: centre },
      },
      features: [],
    };
  if (size.kind === "line") {
    const { fromLocal } = localFrame(centre);
    const a = (bearingDeg * Math.PI) / 180;
    const h = size.lengthM / 2;
    return {
      primary: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            fromLocal([-h * Math.cos(a), -h * Math.sin(a)]),
            fromLocal([h * Math.cos(a), h * Math.sin(a)]),
          ],
        },
      },
      features: [],
    };
  }
  const shape = rect(centre, size.widthM, size.depthM, bearingDeg);
  if (c.type === "building")
    return {
      // The site includes the typical setback around the footprint (room for parking and landscaping).
      primary: rect(
        centre,
        size.widthM + 2 * size.setbackM,
        size.depthM + 2 * size.setbackM,
        bearingDeg,
      ),
      sections: [
        {
          id: newId(),
          footprint: shape,
          storeys: size.storeys ?? 1,
          roof: "flat",
        },
      ],
      features: [],
    };
  return { primary: shape, features: [] };
}

// ---------- Layout ----------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Axis-aligned box in local metres. */
type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box, gap: number) =>
  a.x0 - gap < b.x1 &&
  b.x0 - gap < a.x1 &&
  a.y0 - gap < b.y1 &&
  b.y0 - gap < a.y1;

/**
 * Places the given components around `centre` (roads first as a street grid, then
 * buildings fronting the roads with setbacks, then parks in the remaining space),
 * without overlaps. Returns geometry per component id. Deterministic for a seed.
 */
export function generateLayout(
  components: Pick<Component, "id" | "type" | "subtype" | "params">[],
  centre: Position,
  seed: number,
): Record<string, ComponentGeometry> {
  const rand = rng(seed);
  const { fromLocal } = localFrame(centre);
  const out: Record<string, ComponentGeometry> = {};
  const taken: Box[] = [];
  const bearing = Math.round(rand() * 3) * 15 - 15; // -15°, 0°, 15° or 30°
  const a = (bearing * Math.PI) / 180;
  const rot = ([x, y]: [number, number]): Position =>
    fromLocal([
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
    ]);

  // Roads: alternate east–west and north–south streets, spaced 140 m apart.
  const roads = components.filter((c) => c.type === "road");
  const streets: { horizontal: boolean; offset: number; half: number }[] = [];
  roads.forEach((c, i) => {
    const size = sizeFor(c);
    const half = (size.kind === "line" ? size.lengthM : 400) / 2;
    const horizontal = i % 2 === 0;
    const offset =
      (Math.floor(i / 2) - (horizontal ? 0 : 0)) * 140 * (i % 4 < 2 ? 1 : -1);
    streets.push({ horizontal, offset, half });
    const ends: [number, number][] = horizontal
      ? [
          [-half, offset],
          [half, offset],
        ]
      : [
          [offset, -half],
          [offset, half],
        ];
    out[c.id] = {
      primary: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: ends.map(rot) },
      },
      features: [],
    };
    taken.push(
      horizontal
        ? { x0: -half, y0: offset - 10, x1: half, y1: offset + 10 }
        : { x0: offset - 10, y0: -half, x1: offset + 10, y1: half },
    );
  });
  if (!streets.length) streets.push({ horizontal: true, offset: 0, half: 200 });

  // Candidate spots along each street, on both sides, from the middle outwards.
  // `turn` is 90° on north–south streets so the long side faces the street.
  type Spot = { x: number; y: number; turn: number };
  const frontage = (depth: number, setback: number): Spot[] => {
    const spots: Spot[] = [];
    for (let step = 0; step < 12; step++)
      for (const s of streets)
        for (const side of [1, -1]) {
          const along =
            (step % 2 ? -1 : 1) * Math.ceil(step / 2) * 45 +
            (rand() - 0.5) * 20;
          if (Math.abs(along) > s.half) continue;
          const across = s.offset + side * (10 + setback + depth / 2);
          spots.push(
            s.horizontal
              ? { x: along, y: across, turn: 0 }
              : { x: across, y: along, turn: 90 },
          );
        }
    return spots;
  };
  const anywhere = (): Spot[] =>
    spiral(rand).map(([x, y]) => ({ x, y, turn: 0 }));

  const place = (candidates: Spot[], w: number, d: number) => {
    for (const spot of candidates) {
      const [bw, bd] = spot.turn ? [d, w] : [w, d];
      const box = {
        x0: spot.x - bw / 2,
        y0: spot.y - bd / 2,
        x1: spot.x + bw / 2,
        y1: spot.y + bd / 2,
      };
      if (taken.some((t) => overlaps(box, t, 6))) continue;
      taken.push(box);
      return spot;
    }
    return null;
  };

  for (const c of components.filter(
    (x) =>
      x.type === "building" || x.type === "structure" || x.type === "custom",
  )) {
    const size = sizeFor(c);
    const w = size.kind === "rect" ? size.widthM : 10;
    const d = size.kind === "rect" ? size.depthM : 10;
    const setback = size.kind === "rect" ? size.setbackM : 5;
    const spot = place([...frontage(d, setback), ...anywhere()], w, d);
    if (spot)
      out[c.id] = smartGeometry(c, rot([spot.x, spot.y]), bearing + spot.turn);
  }

  for (const c of components.filter((x) => x.type === "park")) {
    const size = sizeFor(c);
    const w = size.kind === "rect" ? size.widthM : 100;
    const d = size.kind === "rect" ? size.depthM : 100;
    const spot = place([...frontage(d, 5), ...anywhere()], w, d);
    if (spot)
      out[c.id] = smartGeometry(c, rot([spot.x, spot.y]), bearing + spot.turn);
  }
  return out;
}

/** Fallback spots spiralling outwards from the centre. */
function spiral(rand: () => number): [number, number][] {
  const spots: [number, number][] = [];
  for (let r = 60; r < 900; r += 40)
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2 + rand() * 0.3;
      spots.push([r * Math.cos(t), r * Math.sin(t)]);
    }
  return spots;
}
