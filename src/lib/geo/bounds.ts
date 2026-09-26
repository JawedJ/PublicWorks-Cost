import type { AnyFeature, Component } from "@/lib/schemas";

/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number];

type Coords = number[] | Coords[];

function extend(b: Bounds | null, coords: Coords): Bounds | null {
  if (typeof coords[0] === "number") {
    const [lng, lat] = coords as number[];
    if (lng === undefined || lat === undefined) return b;
    return b
      ? [
          Math.min(b[0], lng),
          Math.min(b[1], lat),
          Math.max(b[2], lng),
          Math.max(b[3], lat),
        ]
      : [lng, lat, lng, lat];
  }
  return (coords as Coords[]).reduce<Bounds | null>(extend, b);
}

export function featureBounds(feature: AnyFeature): Bounds | null {
  return extend(null, feature.geometry.coordinates);
}

/** Bounds of everything drawn for a component, or `null` while it is planned. */
export function componentBounds(component: Component): Bounds | null {
  const g = component.geometry;
  if (!g) return null;
  const features: AnyFeature[] = [
    g.primary,
    ...(g.sections ?? []).map((s) => s.footprint),
    ...g.features.map((f) => f.geometry),
  ];
  return features.reduce<Bounds | null>(
    (b, f) => extend(b, f.geometry.coordinates),
    null,
  );
}
