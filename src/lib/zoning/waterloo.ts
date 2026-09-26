import data from "@/data/public/waterloo-zoning.json";
import type { ZoneResult } from "@/lib/schemas";

// Waterloo zoning from the committed snapshot (pnpm data:zoning): point-in-polygon
// against every zone of By-law 2018-050. Server-side only (the file is ~1.2 MB).

type Ring = [number, number][];
type Zone = {
  code: string;
  label?: string;
  family?: string;
  /** Polygons, each [outer, ...holes]. */
  polygons: Ring[][];
  bbox: [number, number, number, number];
};

export const WATERLOO_SOURCE = data.source;
export const WATERLOO_BBOX: [number, number, number, number] = [
  -80.62, 43.42, -80.46, 43.53,
];

const zones: Zone[] = data.features.map((f) => {
  const polygons = (
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates
  ) as Ring[][];
  const pts = polygons.flatMap((p) => p[0] ?? []);
  return {
    code: f.properties.code,
    label: f.properties.label ?? undefined,
    family: f.properties.family ?? undefined,
    polygons,
    bbox: [
      Math.min(...pts.map((p) => p[0])),
      Math.min(...pts.map((p) => p[1])),
      Math.max(...pts.map((p) => p[0])),
      Math.max(...pts.map((p) => p[1])),
    ],
  };
});

function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

const contains = (z: Zone, x: number, y: number) =>
  x >= z.bbox[0] &&
  x <= z.bbox[2] &&
  y >= z.bbox[1] &&
  y <= z.bbox[3] &&
  z.polygons.some(
    ([outer, ...holes]) =>
      !!outer && inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)),
  );

export function waterlooZoneAt(lng: number, lat: number): ZoneResult {
  const z = zones.find((zone) => contains(zone, lng, lat));
  if (!z) return { status: "no_data" };
  return {
    status: "ok",
    city: "Waterloo",
    bylaw: WATERLOO_SOURCE.bylaw,
    code: z.code,
    name:
      [z.label, z.family && `(${z.family})`].filter(Boolean).join(" ") ||
      undefined,
    ...(z.code.startsWith("(H)") && {
      siteSpecific:
        "Holding provision (H): development waits until the hold is lifted",
    }),
    link: WATERLOO_SOURCE.bylawUrl,
  };
}

/** Zones overlapping a box, for drawing on the map (capped). */
export function waterlooZonesIn(
  [w, s, e, n]: [number, number, number, number],
  limit = 800,
) {
  return data.features
    .filter((_, i) => {
      const b = zones[i]!.bbox;
      return b[0] <= e && b[2] >= w && b[1] <= n && b[3] >= s;
    })
    .slice(0, limit);
}
