import type { Position } from "@/lib/schemas";

// Small geometry transforms in metres. Uses a local equirectangular
// approximation, which is accurate to well under 1% over a few kilometres.

const METRES_PER_DEGREE_LAT = 111_320;

type Coords = Position | Coords[];

function mapPositions<T extends Coords>(
  coords: T,
  fn: (p: Position) => Position,
): T {
  if (typeof coords[0] === "number") return fn(coords as Position) as T;
  return (coords as Coords[]).map((c) => mapPositions(c, fn)) as T;
}

/**
 * Returns a copy of `feature` moved `eastM` metres east and `northM` metres north.
 * Works for Point, LineString, and Polygon features (holes included).
 */
export function translateFeature<
  F extends { geometry: { coordinates: Coords } },
>(feature: F, eastM: number, northM: number): F {
  const anchor = firstPosition(feature.geometry.coordinates);
  const cosLat = Math.cos((anchor[1] * Math.PI) / 180);
  const dLng = eastM / (METRES_PER_DEGREE_LAT * Math.max(cosLat, 1e-6));
  const dLat = northM / METRES_PER_DEGREE_LAT;
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: mapPositions(feature.geometry.coordinates, ([lng, lat]) => [
        lng + dLng,
        lat + dLat,
      ]),
    },
  };
}

function firstPosition(coords: Coords): Position {
  return typeof coords[0] === "number"
    ? (coords as Position)
    : firstPosition((coords as Coords[])[0]!);
}
