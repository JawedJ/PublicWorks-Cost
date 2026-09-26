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

export type PositionFn = (p: Position) => Position;

/** A local flat frame in metres (x east, y north) centred on `origin`. */
export function localFrame(origin: Position) {
  const kx =
    METRES_PER_DEGREE_LAT *
    Math.max(Math.cos((origin[1] * Math.PI) / 180), 1e-6);
  const ky = METRES_PER_DEGREE_LAT;
  return {
    toLocal: ([lng, lat]: Position): [number, number] => [
      (lng - origin[0]) * kx,
      (lat - origin[1]) * ky,
    ],
    fromLocal: ([x, y]: [number, number]): Position => [
      origin[0] + x / kx,
      origin[1] + y / ky,
    ],
  };
}

/** Rotates positions about `origin` by `degrees`, counter-clockwise. */
export function rotateAbout(origin: Position, degrees: number): PositionFn {
  const { toLocal, fromLocal } = localFrame(origin);
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (p) => {
    const [x, y] = toLocal(p);
    return fromLocal([x * cos - y * sin, x * sin + y * cos]);
  };
}

/** Scales positions away from `anchor`, `sx` east–west and `sy` north–south. */
export function scaleAbout(
  anchor: Position,
  sx: number,
  sy: number,
): PositionFn {
  const { toLocal, fromLocal } = localFrame(anchor);
  return (p) => {
    const [x, y] = toLocal(p);
    return fromLocal([x * sx, y * sy]);
  };
}

/** Mirrors positions across a line through `origin`: `vertical` flips east–west, `horizontal` flips north–south. */
export function mirrorAbout(
  origin: Position,
  axis: "vertical" | "horizontal",
): PositionFn {
  return axis === "vertical"
    ? scaleAbout(origin, -1, 1)
    : scaleAbout(origin, 1, -1);
}

/**
 * Returns a copy of `feature` with `fn` applied to every position. Set `reverse`
 * after a mirror, so polygon rings keep their winding direction.
 */
export function mapFeature<F extends { geometry: { coordinates: Coords } }>(
  feature: F,
  fn: PositionFn,
  reverse = false,
): F {
  let coordinates = mapPositions(feature.geometry.coordinates, fn);
  if (reverse && isRingList(coordinates)) {
    coordinates = coordinates.map((ring) =>
      [...ring].reverse(),
    ) as typeof coordinates;
  }
  return { ...feature, geometry: { ...feature.geometry, coordinates } };
}

/** True for polygon coordinates (a list of rings). */
function isRingList(coords: Coords): coords is Position[][] {
  const first = coords[0];
  return Array.isArray(first) && Array.isArray(first[0]);
}
