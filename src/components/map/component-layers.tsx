"use client";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect } from "react";
import { componentColor, mapColors } from "@/lib/render/colors";
import type { AnyFeature, Component, PolygonFeature } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { useMap } from "./map-context";

// Plain rendering of every visible component so it can be seen, selected and
// zoomed to. The procedural plan rendering (P1.11–P1.13) replaces the styling.

const SOURCE = "pw-components";
const AREA_SOURCE = "pw-area";
/** Layers that respond to clicks, top first. */
const CLICKABLE = ["pw-point", "pw-line", "pw-section", "pw-fill"];

type Role = "primary" | "section" | "feature";

function toFeatures(components: Component[]): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  const push = (f: AnyFeature, c: Component, role: Role) =>
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        componentId: c.id,
        type: c.type,
        role,
        color: componentColor[c.type],
      },
    });
  for (const c of components) {
    if (!c.visible || !c.geometry) continue;
    push(c.geometry.primary, c, "primary");
    for (const s of c.geometry.sections ?? []) push(s.footprint, c, "section");
    for (const f of c.geometry.features) push(f.geometry, c, "feature");
  }
  return out;
}

function areaFeatures(area: PolygonFeature | null): GeoJSON.Feature[] {
  return area ? [{ ...area, properties: {} }] : [];
}

const isPolygon: ExpressionSpecification = ["==", ["geometry-type"], "Polygon"];
const isLine: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];
const isPoint: ExpressionSpecification = ["==", ["geometry-type"], "Point"];
const selectedFilter = (id: string | null): ExpressionSpecification => [
  "==",
  ["get", "componentId"],
  id ?? "",
];
function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  const { components, areaBoundary, selectedComponentId } = useStore.getState();
  map.addSource(AREA_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: areaFeatures(areaBoundary) },
  });
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: toFeatures(components) },
  });
  map.addLayer({
    id: "pw-area",
    type: "line",
    source: AREA_SOURCE,
    paint: {
      "line-color": mapColors.structure,
      "line-width": 1.5,
      "line-dasharray": [4, 3],
    },
  });
  map.addLayer({
    id: "pw-fill",
    type: "fill",
    source: SOURCE,
    filter: ["all", isPolygon, ["!=", ["get", "role"], "section"]],
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["case", ["==", ["get", "role"], "feature"], 0.5, 0.3],
    },
  });
  map.addLayer({
    id: "pw-section",
    type: "fill",
    source: SOURCE,
    filter: ["all", isPolygon, ["==", ["get", "role"], "section"]],
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.85 },
  });
  map.addLayer({
    id: "pw-outline",
    type: "line",
    source: SOURCE,
    filter: isPolygon,
    paint: { "line-color": ["get", "color"], "line-width": 1.2 },
  });
  map.addLayer({
    id: "pw-line",
    type: "line",
    source: SOURCE,
    filter: isLine,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      // Roads (primary lines) at a rough true width of ~10 m; paths inside parks stay thin.
      "line-width": [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        12,
        ["case", ["==", ["get", "role"], "primary"], 1.5, 1],
        19,
        ["case", ["==", ["get", "role"], "primary"], 60, 4],
      ],
      "line-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "pw-point",
    type: "circle",
    source: SOURCE,
    filter: isPoint,
    paint: {
      "circle-radius": 7,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  // Selection highlight, drawn on top.
  map.addLayer({
    id: "pw-selected-line",
    type: "line",
    source: SOURCE,
    filter: [
      "all",
      ["!=", ["geometry-type"], "Point"],
      selectedFilter(selectedComponentId),
    ],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": mapColors.selected, "line-width": 3 },
  });
  map.addLayer({
    id: "pw-selected-point",
    type: "circle",
    source: SOURCE,
    filter: ["all", isPoint, selectedFilter(selectedComponentId)],
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": mapColors.selected,
      "circle-stroke-width": 3,
    },
  });
}

/** Draws the store's components on the map; clicking one selects it. */
export function ComponentLayers() {
  const map = useMap();
  const components = useStore((s) => s.components);
  const areaBoundary = useStore((s) => s.areaBoundary);
  const selectedId = useStore((s) => s.selectedComponentId);

  // Add layers now and again after a basemap switch (setStyle drops them).
  useEffect(() => {
    if (!map) return;
    addLayers(map);
    const onStyle = () => addLayers(map);
    map.on("style.load", onStyle);

    const onClick = (e: { point: { x: number; y: number } }) => {
      const hit = map
        .queryRenderedFeatures([e.point.x, e.point.y], {
          layers: CLICKABLE.filter((id) => map.getLayer(id)),
        })
        .at(0);
      const id = hit?.properties?.componentId;
      useStore.getState().selectComponent(typeof id === "string" ? id : null);
    };
    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const unpointer = () => (map.getCanvas().style.cursor = "");
    map.on("click", onClick);
    const subs = CLICKABLE.flatMap((layer) => [
      map.on("mouseenter", layer, pointer),
      map.on("mouseleave", layer, unpointer),
    ]);
    return () => {
      map.off("style.load", onStyle);
      map.off("click", onClick);
      subs.forEach((s) => s.unsubscribe());
    };
  }, [map]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE)?.setData({
      type: "FeatureCollection",
      features: toFeatures(components),
    });
  }, [map, components]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(AREA_SOURCE)?.setData({
      type: "FeatureCollection",
      features: areaFeatures(areaBoundary),
    });
  }, [map, areaBoundary]);

  useEffect(() => {
    if (!map?.getLayer("pw-selected-line")) return;
    map.setFilter("pw-selected-line", [
      "all",
      ["!=", ["geometry-type"], "Point"],
      selectedFilter(selectedId),
    ]);
    map.setFilter("pw-selected-point", [
      "all",
      isPoint,
      selectedFilter(selectedId),
    ]);
  }, [map, selectedId, components]);

  return null;
}
