"use client";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { buildPlan } from "@/lib/render/plan";
import { useStore } from "@/lib/store/store";

// Map layers for the procedural plan (src/lib/render/plan.ts). They sit under the
// interactive component layers, which stay transparent for clicks and selection.

const SOURCE = "pw-plan";

/** A width or offset in metres, from a feature property, at any zoom. */
const metres = (prop: string): ExpressionSpecification => [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  0,
  ["*", ["get", prop], ["get", "k0"]],
  24,
  ["*", ["get", prop], ["get", "k0"], 16_777_216],
];
const on = (layer: string): ExpressionSpecification => [
  "==",
  ["get", "layer"],
  layer,
];

const LAYERS: LayerSpecification[] = [
  {
    id: "plan-grass",
    type: "fill",
    source: SOURCE,
    filter: on("grass"),
    paint: { "fill-color": "#b5dc8e", "fill-opacity": 0.85 },
  },
  {
    id: "plan-feature",
    type: "fill",
    source: SOURCE,
    filter: on("feature"),
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.95 },
  },
  {
    id: "plan-feature-custom",
    type: "fill",
    source: SOURCE,
    filter: on("feature-custom"),
    paint: { "fill-pattern": "pw-hatch" },
  },
  {
    id: "plan-feature-outline",
    type: "line",
    source: SOURCE,
    filter: ["any", on("feature"), on("feature-custom")],
    paint: { "line-color": "#ffffff", "line-width": 1.2 },
  },
  {
    id: "plan-marking",
    type: "line",
    source: SOURCE,
    filter: on("marking"),
    minzoom: 15,
    paint: { "line-color": "#ffffff", "line-width": 1.2 },
  },
  {
    id: "plan-stall",
    type: "line",
    source: SOURCE,
    filter: on("stall"),
    minzoom: 16,
    paint: { "line-color": "#ffffff", "line-width": 1 },
  },
  {
    id: "plan-tree",
    type: "circle",
    source: SOURCE,
    filter: on("tree"),
    paint: {
      "circle-color": "#3f7d3a",
      "circle-opacity": 0.85,
      "circle-radius": metres("radiusM"),
      "circle-stroke-color": "#2f5f2b",
      "circle-stroke-width": 0.5,
    },
  },
  {
    id: "plan-road-base",
    type: "line",
    source: SOURCE,
    filter: on("road-base"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#d9d9dc",
      "line-width": metres("widthM"),
    },
  },
  {
    id: "plan-road-curb",
    type: "line",
    source: SOURCE,
    filter: on("road-curb"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#8e939b",
      "line-width": metres("widthM"),
    },
  },
  {
    id: "plan-road-asphalt",
    type: "line",
    source: SOURCE,
    filter: on("road-asphalt"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#51565e",
      "line-width": metres("widthM"),
    },
  },
  {
    id: "plan-road-cycle",
    type: "line",
    source: SOURCE,
    filter: on("road-cycle"),
    minzoom: 15,
    paint: {
      "line-color": "#2f9e57",
      "line-width": metres("widthM"),
      "line-offset": metres("offsetM"),
    },
  },
  {
    id: "plan-road-lane",
    type: "line",
    source: SOURCE,
    filter: on("road-lane"),
    minzoom: 16,
    paint: {
      "line-color": "#ffffff",
      "line-width": 1,
      "line-dasharray": [3, 3],
      "line-offset": metres("offsetM"),
    },
  },
  {
    id: "plan-road-centre",
    type: "line",
    source: SOURCE,
    filter: on("road-centre"),
    minzoom: 15,
    paint: {
      "line-color": "#f2c230",
      "line-width": 1.5,
      "line-dasharray": [4, 3],
      "line-offset": metres("offsetM"),
    },
  },
  {
    id: "plan-roof",
    type: "fill",
    source: SOURCE,
    filter: on("roof"),
    paint: { "fill-color": ["get", "color"] },
  },
  {
    id: "plan-parapet",
    type: "line",
    source: SOURCE,
    filter: ["all", on("roof"), ["==", ["get", "roof"], "flat"]],
    minzoom: 16,
    paint: { "line-color": "#f4efe9", "line-width": 1, "line-offset": 2.5 },
  },
  {
    id: "plan-roof-outline",
    type: "line",
    source: SOURCE,
    filter: on("roof"),
    paint: { "line-color": "#5c4a3d", "line-width": 1 },
  },
  {
    id: "plan-ridge",
    type: "line",
    source: SOURCE,
    filter: on("ridge"),
    paint: { "line-color": "#4a3b30", "line-width": 1.5 },
  },
  {
    id: "plan-storeys",
    type: "symbol",
    source: SOURCE,
    filter: on("storeys"),
    minzoom: 16,
    layout: {
      "text-field": ["get", "text"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.4],
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#3b2f27",
      "text-halo-width": 1.5,
    },
  },
  {
    id: "plan-feature-label",
    type: "symbol",
    source: SOURCE,
    filter: on("feature-label"),
    minzoom: 16,
    layout: {
      "text-field": ["get", "text"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
    },
    paint: {
      "text-color": "#374151",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  },
];

/** A diagonal hatch for custom features. */
function addHatch(map: MapLibreMap) {
  if (map.hasImage("pw-hatch")) return;
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const line = (x + y) % size < 2;
      data.set(line ? [120, 113, 100, 255] : [232, 228, 218, 255], i);
    }
  map.addImage("pw-hatch", { width: size, height: size, data });
}

function addLayers(map: MapLibreMap, beforeId: string | undefined) {
  if (map.getSource(SOURCE)) return;
  addHatch(map);
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  for (const l of LAYERS) map.addLayer(l, beforeId);
}

/** Draws the procedural plan under the component layers. `beforeId` is the first component layer. */
export function PlanLayers({
  map,
  beforeId,
}: {
  map: MapLibreMap | null;
  beforeId: string;
}) {
  const components = useStore((s) => s.components);
  const colourByCost = useStore((s) => s.colourByCost);
  const plan = useMemo(
    () => (colourByCost ? [] : buildPlan(components)),
    [components, colourByCost],
  );

  useEffect(() => {
    if (!map) return;
    const add = () => {
      addLayers(map, map.getLayer(beforeId) ? beforeId : undefined);
      map
        .getSource<GeoJSONSource>(SOURCE)
        ?.setData({ type: "FeatureCollection", features: plan });
    };
    add();
    map.on("style.load", add);
    return () => {
      map.off("style.load", add);
    };
  }, [map, beforeId, plan]);

  return null;
}
