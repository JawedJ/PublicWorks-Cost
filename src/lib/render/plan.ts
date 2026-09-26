import { resolveParams } from "@/engine/params";
import { templates } from "@/engine/templates";
import { pointInRing } from "@/lib/geo/edit";
import { localFrame } from "@/lib/geo/transform";
import type {
  BuildingSection,
  Component,
  PlacedFeature,
  Position,
} from "@/lib/schemas";
import { mapColors } from "./colors";

// Procedural 2D plan rendering (SPEC 11, P1.11–P1.13), generated from the actual
// shapes: roads at true width with markings, building roofs with storeys badges,
// parks with seeded tree scatter, field markings and parking stalls. Output is one
// GeoJSON collection; each feature's `layer` property picks its map layer.
// Deterministic: randomness is seeded from the component id.

export type PlanFeature = GeoJSON.Feature<
  GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon,
  Record<string, string | number | boolean>
>;

type XY = [number, number];

function rng(seedText: string): () => number {
  let a = 0;
  for (let i = 0; i < seedText.length; i++)
    a = (Math.imul(a, 31) + seedText.charCodeAt(i)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pixels per metre at zoom 0 at this latitude (MapLibre's 512 px tiles). */
export function pxPerMetreZ0(lat: number): number {
  return 512 / (40_075_016.686 * Math.cos((lat * Math.PI) / 180));
}

// ---------- Roads ----------

export type RoadProfile = {
  lanes: number;
  laneWidthM: number;
  carriagewayM: number;
  totalM: number;
  sidewalkSides: number;
  sidewalkWidthM: number;
  cycling: string;
  parkingLanes: number;
};

export function roadProfile(c: Component): RoadProfile {
  const p = resolveParams(templates.road, c.subtype, c.params);
  const n = (id: string, d: number) =>
    typeof p[id] === "number" ? (p[id] as number) : d;
  const lanes = n("lanes", 2);
  const laneWidthM = n("laneWidthM", 3.5);
  const parkingLanes = n("parkingLanes", 0);
  const cycling = typeof p.cycling === "string" ? p.cycling : "none";
  const sidewalkSides = n("sidewalkSides", 2);
  const sidewalkWidthM = n("sidewalkWidthM", 1.8);
  const bike = cycling === "painted_lane" ? 1.8 * 2 : 0;
  const carriagewayM = lanes * laneWidthM + parkingLanes * 2.4 + bike;
  const track = cycling === "cycle_track" ? 2 * 2 : 0;
  const totalM = carriagewayM + sidewalkSides * (sidewalkWidthM + 1) + track;
  return {
    lanes,
    laneWidthM,
    carriagewayM,
    totalM,
    sidewalkSides,
    sidewalkWidthM,
    cycling,
    parkingLanes,
  };
}

function roadFeatures(c: Component, out: PlanFeature[]) {
  const g = c.geometry?.primary.geometry;
  if (g?.type !== "LineString") return;
  const r = roadProfile(c);
  const k0 = pxPerMetreZ0(g.coordinates[0]![1]);
  const line = (props: Record<string, string | number>) =>
    out.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: g.coordinates },
      properties: { componentId: c.id, k0, ...props },
    });
  line({ layer: "road-base", widthM: r.totalM });
  line({ layer: "road-curb", widthM: r.carriagewayM + 0.5 });
  line({ layer: "road-asphalt", widthM: r.carriagewayM });
  const half = r.carriagewayM / 2;
  if (r.cycling === "painted_lane")
    for (const s of [-1, 1])
      line({ layer: "road-cycle", widthM: 1.5, offsetM: s * (half - 0.9) });
  if (r.cycling === "cycle_track")
    for (const s of [-1, 1])
      line({ layer: "road-cycle", widthM: 2, offsetM: s * (half + 1.3) });
  // Lane dividers across the travel lanes; the middle one is the centre line.
  const travel = r.lanes * r.laneWidthM;
  for (let i = 1; i < r.lanes; i++) {
    const offsetM = -travel / 2 + i * r.laneWidthM;
    const centre = r.lanes % 2 === 0 && i === r.lanes / 2;
    line({
      layer: centre ? "road-centre" : "road-lane",
      widthM: 0.15,
      offsetM,
    });
  }
}

// ---------- Buildings ----------

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - amount));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function centroid(ring: Position[]): Position {
  const pts = ring.slice(0, -1);
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

/** An oriented frame along the ring's longest edge: to/from local x (along) and y (across) in metres. */
function orientedFrame(ring: Position[]) {
  const origin = centroid(ring);
  const { toLocal, fromLocal } = localFrame(origin);
  const pts = ring.map(toLocal);
  let best = 0;
  let angle = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > best) {
      best = len;
      angle = Math.atan2(y1 - y0, x1 - x0);
    }
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toFrame = (p: Position): XY => {
    const [x, y] = toLocal(p);
    return [x * cos + y * sin, -x * sin + y * cos];
  };
  const fromFrame = ([u, v]: XY): Position =>
    fromLocal([u * cos - v * sin, u * sin + v * cos]);
  const local = ring.map(toFrame);
  const us = local.map((p) => p[0]);
  const vs = local.map((p) => p[1]);
  return {
    toFrame,
    fromFrame,
    box: {
      u0: Math.min(...us),
      u1: Math.max(...us),
      v0: Math.min(...vs),
      v1: Math.max(...vs),
    },
  };
}

function sectionFeatures(c: Component, s: BuildingSection, out: PlanFeature[]) {
  const ring = s.footprint.geometry.coordinates[0]!;
  const color =
    s.roof === "green"
      ? "#7fb069"
      : shade(mapColors.building, Math.min(s.storeys / 14, 0.55));
  out.push({
    type: "Feature",
    geometry: s.footprint.geometry,
    properties: {
      layer: "roof",
      componentId: c.id,
      sectionId: s.id,
      color,
      roof: s.roof,
    },
  });
  // Pitched roofs on simple (four-cornered) shapes get a ridge along the long axis.
  if (s.roof === "pitched" && ring.length === 5) {
    const f = orientedFrame(ring);
    const vm = (f.box.v0 + f.box.v1) / 2;
    const inset = (f.box.v1 - f.box.v0) / 2;
    out.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          f.fromFrame([f.box.u0 + inset, vm]),
          f.fromFrame([f.box.u1 - inset, vm]),
        ],
      },
      properties: { layer: "ridge", componentId: c.id },
    });
  }
  out.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: centroid(ring) },
    properties: {
      layer: "storeys",
      componentId: c.id,
      text: `${s.storeys}F`,
    },
  });
}

// ---------- Parks ----------

const FEATURE_FILL: Record<string, string> = {
  sports_field: "#5fae4f",
  playground: "#f5a524",
  splash_pad: "#56c2f0",
  parking: "#b8bcc2",
  plaza: "#e4e1da",
  sports_court: "#c56b4a",
  skate_park: "#c9c9c9",
  outdoor_rink: "#d6ecf5",
  dog_park: "#b9d98b",
  community_garden: "#8fb86a",
  tree_planting: "#6fa85e",
  washroom: "#8b7d6b",
};

function inPolygon(p: Position, coords: Position[][]): boolean {
  const [outer, ...holes] = coords;
  return pointInRing(p, outer!) && !holes.some((h) => pointInRing(p, h));
}

/** Seeded jittered-grid tree scatter inside the park, outside its polygon features. */
function treeFeatures(c: Component, out: PlanFeature[]) {
  const g = c.geometry!;
  if (g.primary.geometry.type !== "Polygon") return;
  const coords = g.primary.geometry.coordinates;
  const blockers = g.features
    .map((f) => f.geometry.geometry)
    .filter(
      (x): x is GeoJSON.Polygon & { coordinates: Position[][] } =>
        x.type === "Polygon",
    );
  const ring = coords[0]!;
  const origin = centroid(ring);
  const { toLocal, fromLocal } = localFrame(origin);
  const local = ring.map(toLocal);
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  const spacing = 14;
  const rand = rng(c.id);
  const k0 = pxPerMetreZ0(origin[1]);
  let count = 0;
  for (let x = Math.min(...xs); x < Math.max(...xs); x += spacing) {
    for (let y = Math.min(...ys); y < Math.max(...ys); y += spacing) {
      if (count >= 600) return;
      const p = fromLocal([
        x + (rand() - 0.5) * spacing * 0.8,
        y + (rand() - 0.5) * spacing * 0.8,
      ]);
      const skip = rand() < 0.35; // leave open lawn
      if (skip || !inPolygon(p, coords)) continue;
      if (blockers.some((b) => inPolygon(p, b.coordinates))) continue;
      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: p },
        properties: {
          layer: "tree",
          componentId: c.id,
          k0,
          radiusM: 2.5 + rand() * 2,
        },
      });
      count++;
    }
  }
}

function lineFeature(
  a: Position,
  b: Position,
  layer: string,
  componentId: string,
): PlanFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [a, b] },
    properties: { layer, componentId },
  };
}

function placedFeature(c: Component, f: PlacedFeature, out: PlanFeature[]) {
  const geom = f.geometry.geometry;
  if (geom.type !== "Polygon") return;
  const ring = geom.coordinates[0]!;
  const custom = f.kind === "custom" || !FEATURE_FILL[f.kind];
  out.push({
    type: "Feature",
    geometry: geom,
    properties: {
      layer: custom ? "feature-custom" : "feature",
      componentId: c.id,
      featureId: f.id,
      color: FEATURE_FILL[f.kind] ?? "#d9d4c7",
    },
  });
  const fr = orientedFrame(ring);
  const { u0, u1, v0, v1 } = fr.box;
  if (f.kind === "sports_field") {
    // Halfway line and centre circle fitted to the field's orientation and size.
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    out.push(
      lineFeature(
        fr.fromFrame([um, v0 + 1]),
        fr.fromFrame([um, v1 - 1]),
        "marking",
        c.id,
      ),
    );
    const r = Math.min(9.15, (v1 - v0) / 4);
    const circle: Position[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      circle.push(fr.fromFrame([um + r * Math.cos(a), vm + r * Math.sin(a)]));
    }
    out.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: circle },
      properties: { layer: "marking", componentId: c.id },
    });
  }
  if (f.kind === "parking") {
    // Stalls 2.6 m wide, up to 5.5 m deep, along both long sides.
    const depth = Math.min(5.5, (v1 - v0) / 2);
    for (let u = u0 + 2.6; u < u1 - 1; u += 2.6) {
      out.push(
        lineFeature(
          fr.fromFrame([u, v0]),
          fr.fromFrame([u, v0 + depth]),
          "stall",
          c.id,
        ),
      );
      if (v1 - v0 > 11)
        out.push(
          lineFeature(
            fr.fromFrame([u, v1]),
            fr.fromFrame([u, v1 - depth]),
            "stall",
            c.id,
          ),
        );
    }
  }
  if (custom && f.customLabel) {
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: centroid(ring) },
      properties: {
        layer: "feature-label",
        componentId: c.id,
        text: f.customLabel,
      },
    });
  }
}

/** Everything the plan view draws for these components. */
export function buildPlan(components: Component[]): PlanFeature[] {
  const out: PlanFeature[] = [];
  for (const c of components) {
    if (!c.visible || !c.geometry) continue;
    if (c.type === "road") roadFeatures(c, out);
    if (c.type === "park" && c.geometry.primary.geometry.type === "Polygon") {
      out.push({
        type: "Feature",
        geometry: c.geometry.primary.geometry,
        properties: { layer: "grass", componentId: c.id },
      });
      treeFeatures(c, out);
    }
    // A parking lot draws like a parking area feature: asphalt with stall lines.
    if (c.type === "parking")
      placedFeature(
        c,
        { id: c.id, kind: "parking", geometry: c.geometry.primary, params: {} },
        out,
      );
    for (const f of c.geometry.features) placedFeature(c, f, out);
    for (const s of c.geometry.sections ?? []) sectionFeatures(c, s, out);
  }
  return out;
}
