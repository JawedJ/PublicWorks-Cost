import type {
  AnyFeature,
  Component,
  ComponentGeometry,
  PolygonFeature,
  Position,
} from "@/lib/schemas";
import turfUnion from "@turf/union";
import { featureCollection } from "@turf/helpers";
import type { BuildingSection } from "@/lib/schemas";
import { componentBounds } from "./bounds";
import { mapFeature, type PositionFn } from "./transform";

// Editing a drawn component (SPEC 11, "Editing, without limits"): which of its
// shapes can be edited, writing an edited shape back, whole-component transforms,
// and holes. Pure functions; the store turns each edit into one undo step.

/** One shape inside a component's geometry. */
export type ElementRef =
  | { role: "primary" }
  | { role: "section"; id: string }
  | { role: "feature"; id: string };

export type EditableElement = { ref: ElementRef; shape: AnyFeature };

function sameCoords(a: AnyFeature, b: AnyFeature): boolean {
  return (
    a.geometry.type === b.geometry.type &&
    JSON.stringify(a.geometry.coordinates) ===
      JSON.stringify(b.geometry.coordinates)
  );
}

/**
 * A building's first shape is both its site and its first section until a separate
 * site is drawn (SPEC change log P1.5). While they match, they are edited together.
 */
export function sharesSite(g: ComponentGeometry): boolean {
  const first = g.sections?.[0];
  return Boolean(first && sameCoords(g.primary, first.footprint));
}

/** The shapes the user can grab and reshape, top-most last. */
export function editableElements(c: Component): EditableElement[] {
  const g = c.geometry;
  if (!g) return [];
  const out: EditableElement[] = [];
  if (!sharesSite(g)) out.push({ ref: { role: "primary" }, shape: g.primary });
  for (const s of g.sections ?? [])
    out.push({ ref: { role: "section", id: s.id }, shape: s.footprint });
  for (const f of g.features)
    out.push({ ref: { role: "feature", id: f.id }, shape: f.geometry });
  return out;
}

export function elementShape(
  g: ComponentGeometry,
  ref: ElementRef,
): AnyFeature | undefined {
  if (ref.role === "primary") return g.primary;
  if (ref.role === "section")
    return g.sections?.find((s) => s.id === ref.id)?.footprint;
  return g.features.find((f) => f.id === ref.id)?.geometry;
}

/**
 * The map editor only handles a polygon's outline. Puts the old shape's holes back
 * on an edited outline, shifted along if the whole shape was dragged.
 */
function restoreHoles(
  old: AnyFeature,
  shape: AnyFeature,
  moved: boolean,
): AnyFeature {
  if (old.geometry.type !== "Polygon" || shape.geometry.type !== "Polygon")
    return shape;
  const [, ...holes] = old.geometry.coordinates;
  if (!holes.length || shape.geometry.coordinates.length > 1) return shape;
  const [dLng, dLat] = moved ? shift(old, shape) : [0, 0];
  return {
    ...shape,
    geometry: {
      type: "Polygon",
      coordinates: [
        shape.geometry.coordinates[0]!,
        ...holes.map((ring) =>
          ring.map(([lng, lat]): Position => [lng + dLng, lat + dLat]),
        ),
      ],
    },
  };
}

/**
 * Replaces one shape. `moved` means it was dragged whole rather than reshaped.
 * Returns `null` if the element is gone or the geometry type changed.
 */
export function withElementShape(
  g: ComponentGeometry,
  ref: ElementRef,
  shape: AnyFeature,
  moved = false,
): ComponentGeometry | null {
  const old = elementShape(g, ref);
  if (!old || old.geometry.type !== shape.geometry.type) return null;
  const next = {
    ...restoreHoles(old, shape, moved),
    properties: old.properties,
  };
  if (ref.role === "primary") return { ...g, primary: next };
  if (ref.role === "feature")
    return {
      ...g,
      features: g.features.map((f) =>
        f.id === ref.id ? { ...f, geometry: next } : f,
      ),
    };
  const footprint = next as PolygonFeature;
  const linked = g.sections?.[0]?.id === ref.id && sharesSite(g);
  return {
    ...g,
    primary: linked ? footprint : g.primary,
    sections: g.sections?.map((s) =>
      s.id === ref.id ? { ...s, footprint } : s,
    ),
  };
}

/** Applies `fn` to every shape of a component. */
export function transformGeometry(
  g: ComponentGeometry,
  fn: PositionFn,
  reverse = false,
): ComponentGeometry {
  return {
    primary: mapFeature(g.primary, fn, reverse),
    sections: g.sections?.map((s) => ({
      ...s,
      footprint: mapFeature(s.footprint, fn, reverse),
    })),
    features: g.features.map((f) => ({
      ...f,
      geometry: mapFeature(f.geometry, fn, reverse),
    })),
  };
}

function firstPosition(f: AnyFeature): Position {
  const c = f.geometry.coordinates;
  if (f.geometry.type === "Point") return c as Position;
  if (f.geometry.type === "LineString") return (c as Position[])[0]!;
  return (c as Position[][])[0]![0]!;
}

/** How far a dragged shape moved, in degrees [dLng, dLat]. */
function shift(from: AnyFeature, to: AnyFeature): [number, number] {
  const [lng0, lat0] = firstPosition(from);
  const [lng1, lat1] = firstPosition(to);
  return [lng1 - lng0, lat1 - lat0];
}

/**
 * The primary shape was dragged to `moved`: carry everything inside it along
 * (a park's features, a site's sections) by the same shift in degrees.
 */
export function withPrimaryMoved(
  g: ComponentGeometry,
  moved: AnyFeature,
): ComponentGeometry | null {
  if (moved.geometry.type !== g.primary.geometry.type) return null;
  const [dLng, dLat] = shift(g.primary, moved);
  const shifted = transformGeometry(g, ([lng, lat, ...rest]) => [
    lng + dLng,
    lat + dLat,
    ...rest,
  ]);
  return {
    ...shifted,
    primary: {
      ...restoreHoles(g.primary, moved, true),
      properties: g.primary.properties,
    },
  };
}

/** Centre of the component's bounding box, the pivot for rotate and mirror. */
export function componentCentre(c: Component): Position | null {
  const b = componentBounds(c);
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

/** Ray-casting point-in-ring test (lng/lat treated as flat, fine at site scale). */
export function pointInRing(p: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/**
 * Which polygon a new hole goes into: the selected polygon feature or section,
 * else a building's first section, else a polygon primary.
 */
export function holeTarget(
  c: Component,
  selected?: { sectionId?: string; featureId?: string },
): ElementRef | null {
  const g = c.geometry;
  if (!g) return null;
  const feature = g.features.find((f) => f.id === selected?.featureId);
  if (feature?.geometry.geometry.type === "Polygon")
    return { role: "feature", id: feature.id };
  if (g.sections?.length) {
    const s =
      g.sections.find((x) => x.id === selected?.sectionId) ?? g.sections[0]!;
    return { role: "section", id: s.id };
  }
  return g.primary.geometry.type === "Polygon" ? { role: "primary" } : null;
}

/**
 * Cuts `hole` out of a polygon (e.g. a courtyard). Returns `null` unless the hole
 * lies inside the outer boundary and clear of existing holes.
 */
export function withHole(
  g: ComponentGeometry,
  ref: ElementRef,
  hole: PolygonFeature,
): ComponentGeometry | null {
  const target = elementShape(g, ref);
  if (target?.geometry.type !== "Polygon") return null;
  const [outer, ...holes] = target.geometry.coordinates;
  const ring = hole.geometry.coordinates[0]!;
  const fits =
    ring.every((p) => pointInRing(p, outer!)) &&
    holes.every(
      (h) =>
        !ring.some((p) => pointInRing(p, h)) &&
        !h.some((p) => pointInRing(p, ring)),
    );
  if (!fits) return null;
  return withElementShape(g, ref, {
    ...target,
    geometry: {
      type: "Polygon",
      coordinates: [...target.geometry.coordinates, ring],
    },
  });
}

/** Removes a section or feature. The last section can't be removed (delete the building instead). */
export function withoutElement(
  g: ComponentGeometry,
  ref: ElementRef,
): ComponentGeometry | null {
  if (ref.role === "feature") {
    const features = g.features.filter((f) => f.id !== ref.id);
    return features.length === g.features.length ? null : { ...g, features };
  }
  if (ref.role === "section") {
    const sections = g.sections?.filter((s) => s.id !== ref.id) ?? [];
    if (!sections.length || sections.length === g.sections?.length) return null;
    return { ...g, sections };
  }
  return null;
}

type Screen = [number, number];

function segmentDistance(p: Screen, a: Screen, b: Screen): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
    : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Which of a component's shapes a click at `at` picks: the nearest point, else the
 * nearest line, else the smallest polygon containing it (so a section or feature
 * inside a site wins over the site). `toScreen` converts to pixels.
 */
export function pickElement(
  elements: EditableElement[],
  at: Position,
  toScreen: (p: Position) => Screen,
  tolerancePx = 8,
): ElementRef | null {
  const p = toScreen(at);
  let best: { ref: ElementRef; rank: number; score: number } | null = null;
  const offer = (ref: ElementRef, rank: number, score: number) => {
    if (!best || rank < best.rank || (rank === best.rank && score < best.score))
      best = { ref, rank, score };
  };
  for (const { ref, shape } of elements) {
    const g = shape.geometry;
    if (g.type === "Point") {
      const d = Math.hypot(
        ...(toScreen(g.coordinates).map((v, i) => v - p[i]!) as Screen),
      );
      if (d <= tolerancePx) offer(ref, 0, d);
    } else if (g.type === "LineString") {
      const pts = g.coordinates.map(toScreen);
      const d = Math.min(
        ...pts.slice(1).map((b, i) => segmentDistance(p, pts[i]!, b)),
      );
      if (d <= tolerancePx) offer(ref, 1, d);
    } else {
      const [outer, ...holes] = g.coordinates;
      if (!pointInRing(at, outer!) || holes.some((h) => pointInRing(at, h)))
        continue;
      const pts = outer!.map(toScreen);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      const area =
        (Math.max(...xs) - Math.min(...xs)) *
        (Math.max(...ys) - Math.min(...ys));
      offer(ref, 2, area);
    }
  }
  return best ? (best as { ref: ElementRef }).ref : null;
}

/**
 * Merges building sections into one (the tallest section's storeys and roof win).
 * Returns `null` if fewer than two sections or they don't form one polygon.
 */
export function withMergedSections(
  g: ComponentGeometry,
  ids: string[],
): ComponentGeometry | null {
  const picked = (g.sections ?? []).filter((s) => ids.includes(s.id));
  if (picked.length < 2) return null;
  const merged = turfUnion(featureCollection(picked.map((s) => s.footprint)));
  if (merged?.geometry.type !== "Polygon") return null;
  const tallest = picked.reduce((a, b) => (b.storeys > a.storeys ? b : a));
  const section: BuildingSection = {
    ...tallest,
    footprint: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: merged.geometry.coordinates as Position[][],
      },
    },
  };
  const firstIndex = g.sections!.findIndex((s) => ids.includes(s.id));
  const rest = g.sections!.filter((s) => !ids.includes(s.id));
  rest.splice(firstIndex, 0, section);
  const linked = sharesSite(g) && ids.includes(g.sections![0]!.id);
  return {
    ...g,
    primary: linked && firstIndex === 0 ? section.footprint : g.primary,
    sections: rest,
  };
}
