"use client";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Popup,
} from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { componentBounds } from "@/lib/geo/bounds";
import { formatMeasurements } from "@/lib/geo/format";
import { measureComponent } from "@/lib/geo/measure";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { intlLocale, type Locale } from "@/lib/i18n/routing";
import { componentColor, mapColors } from "@/lib/render/colors";
import type { AnyFeature, Component, PolygonFeature } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { DRAW_LAYER_PREFIX, justFinishedDrawing } from "./draw-controller";
import { useMap } from "./map-context";
import { IssueHighlights } from "./issue-highlights";
import { PlanLayers } from "./plan-layers";
import { WarningMarkers } from "./warning-markers";
import { MeasurementLabels } from "./measurement-labels";
import { HANDLE_CLASS } from "./transform-handles";

// Plain rendering of every visible component so it can be seen, selected and
// zoomed to. The procedural plan rendering (P1.11–P1.13) replaces the styling.

const SOURCE = "pw-components";
/** Storey height when a section doesn't set one, for 3D extrusion. */
export const DEFAULT_FLOOR_HEIGHT_M = 4;
const AREA_SOURCE = "pw-area";
/** Layers that respond to clicks, top first. */
const CLICKABLE = ["pw-point", "pw-line", "pw-section", "pw-fill"];

type Role = "primary" | "section" | "feature";

/** Cost per component for colour by cost and tooltips. */
export type CostInfo = Map<string, { p50: number; share: number }>;

/** Light yellow (cheapest) → deep red (most expensive), by share of the largest. */
function costColor(share: number, maxShare: number): string {
  const ramp = ["#fde68a", "#fbbf24", "#f97316", "#dc2626", "#7f1d1d"];
  const i = Math.min(
    ramp.length - 1,
    Math.floor((maxShare ? share / maxShare : 0) * (ramp.length - 1) + 0.5),
  );
  return ramp[i]!;
}

function toFeatures(
  components: Component[],
  cost?: CostInfo | null,
): GeoJSON.Feature[] {
  const maxShare = cost
    ? Math.max(0, ...[...cost.values()].map((x) => x.share))
    : 0;
  const out: GeoJSON.Feature[] = [];
  const push = (
    f: AnyFeature,
    c: Component,
    role: Role,
    extra: Record<string, unknown> = {},
  ) =>
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        componentId: c.id,
        type: c.type,
        role,
        color: cost
          ? costColor(cost.get(c.id)?.share ?? 0, maxShare)
          : componentColor[c.type],
        // Drawn by the procedural plan instead (roads, parks, features, sections); still clickable.
        plan:
          !cost &&
          (role !== "primary" || c.type === "road" || c.type === "park"),
        ...extra,
      },
    });
  for (const c of components) {
    if (!c.visible || !c.geometry) continue;
    push(c.geometry.primary, c, "primary");
    for (const s of c.geometry.sections ?? [])
      push(s.footprint, c, "section", {
        sectionId: s.id,
        heightM: s.storeys * (s.floorHeightM ?? DEFAULT_FLOOR_HEIGHT_M),
      });
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
/** Hover highlight colour (bright amber, distinct from the selection outline). */
const HOVER_COLOR = "#fbbf24";
const selectedFilter = (id: string | null): ExpressionSpecification => [
  "==",
  ["get", "componentId"],
  id ?? "",
];
function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  // Keep components below Terra Draw's in-progress shape.
  const beforeId = map
    .getStyle()
    .layers.find((l) => l.id.startsWith(`${DRAW_LAYER_PREFIX}-`))?.id;
  const { components, areaBoundary, selectedComponentId } = useStore.getState();
  map.addSource(AREA_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: areaFeatures(areaBoundary) },
  });
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: toFeatures(components) },
  });
  map.addLayer(
    {
      id: "pw-area",
      type: "line",
      source: AREA_SOURCE,
      paint: {
        "line-color": mapColors.structure,
        "line-width": 1.5,
        "line-dasharray": [4, 3],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "pw-fill",
      type: "fill",
      source: SOURCE,
      filter: ["all", isPolygon, ["!=", ["get", "role"], "section"]],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": [
          "case",
          ["get", "plan"],
          0,
          ["==", ["get", "role"], "feature"],
          0.5,
          0.3,
        ],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "pw-section",
      type: "fill",
      source: SOURCE,
      filter: ["all", isPolygon, ["==", ["get", "role"], "section"]],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["get", "plan"], 0, 0.85],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "pw-outline",
      type: "line",
      source: SOURCE,
      filter: isPolygon,
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1.2,
        "line-opacity": ["case", ["get", "plan"], 0, 1],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
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
        "line-opacity": ["case", ["get", "plan"], 0, 0.85],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
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
    },
    beforeId,
  );
  // 3D map view: every building section extruded to its own height (P1.18).
  const is3d = useStore.getState().viewMode === "map3d";
  map.addLayer(
    {
      id: "pw-extrusion",
      type: "fill-extrusion",
      source: SOURCE,
      filter: ["all", isPolygon, ["==", ["get", "role"], "section"]],
      layout: { visibility: is3d ? "visible" : "none" },
      paint: {
        "fill-extrusion-color": [
          "case",
          ["==", ["get", "componentId"], selectedComponentId ?? ""],
          mapColors.selected,
          ["get", "color"],
        ],
        "fill-extrusion-height": ["get", "heightM"],
        "fill-extrusion-opacity": 0.9,
      },
    },
    beforeId,
  );
  // Hover highlight (e.g. from the estimate's bar chart): a glow under the selection.
  map.addLayer(
    {
      id: "pw-hover-fill",
      type: "fill",
      source: SOURCE,
      filter: ["all", isPolygon, selectedFilter(null)],
      paint: { "fill-color": HOVER_COLOR, "fill-opacity": 0.35 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "pw-hover-line",
      type: "line",
      source: SOURCE,
      filter: ["all", ["!=", ["geometry-type"], "Point"], selectedFilter(null)],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": HOVER_COLOR,
        "line-width": 7,
        "line-blur": 2,
        "line-opacity": 0.9,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "pw-hover-point",
      type: "circle",
      source: SOURCE,
      filter: ["all", isPoint, selectedFilter(null)],
      paint: {
        "circle-radius": 14,
        "circle-color": HOVER_COLOR,
        "circle-opacity": 0.45,
      },
    },
    beforeId,
  );
  // Selection highlight, drawn on top.
  map.addLayer(
    {
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
    },
    beforeId,
  );
  map.addLayer(
    {
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
    },
    beforeId,
  );
}

/** Draws the store's components on the map; clicking one selects it. */
export function ComponentLayers() {
  const map = useMap();
  const t = useTranslations("map");
  const locale = intlLocale[useLocale() as Locale];
  const tooltip = useRef<Popup | null>(null);
  const costRef = useRef<CostInfo | null>(null);
  const labels = useRef({
    money: (n: number) => String(n),
    noCost: "",
    locale: "en-CA",
    measureWords: { footprint: "", floorArea: "" },
  });
  useEffect(() => {
    const fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    });
    labels.current = {
      money: (n) => fmt.format(n),
      noCost: t("noCost"),
      locale,
      measureWords: {
        footprint: t("measureWords.footprint"),
        floorArea: t("measureWords.floorArea"),
      },
    };
  }, [locale, t]);
  const components = useStore((s) => s.components);
  const areaBoundary = useStore((s) => s.areaBoundary);
  const selectedId = useStore((s) => s.selectedComponentId);
  const viewMode = useStore((s) => s.viewMode);
  const colourByCost = useStore((s) => s.colourByCost);
  const { estimate } = useEstimate();
  const cost = useMemo<CostInfo | null>(
    () =>
      estimate
        ? new Map(
            estimate.components.map((c) => [
              c.componentId,
              { p50: c.p50, share: c.share },
            ]),
          )
        : null,
    [estimate],
  );
  useEffect(() => {
    costRef.current = cost;
  }, [cost]);

  useEffect(() => {
    if (!map?.getLayer("pw-extrusion")) return;
    map.setLayoutProperty(
      "pw-extrusion",
      "visibility",
      viewMode === "map3d" ? "visible" : "none",
    );
  }, [map, viewMode]);

  // Add layers now and again after a basemap switch (setStyle drops them).
  useEffect(() => {
    if (!map) return;
    addLayers(map);
    // Opening a project (e.g. the sample from the landing page): show all of it.
    const all = useStore
      .getState()
      .components.map(componentBounds)
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (all.length)
      map.fitBounds(
        [
          Math.min(...all.map((b) => b[0])),
          Math.min(...all.map((b) => b[1])),
          Math.max(...all.map((b) => b[2])),
          Math.max(...all.map((b) => b[3])),
        ],
        { padding: 60, duration: 0 },
      );
    const onStyle = () => addLayers(map);
    map.on("style.load", onStyle);

    const onClick = (e: MapMouseEvent) => {
      if (useStore.getState().drawing || justFinishedDrawing()) return;
      // Clicks on transform handles, or on the shapes being edited, belong to the editor.
      const el = e.originalEvent.target as HTMLElement | null;
      if (el?.closest(`.${HANDLE_CLASS}`)) return;
      const drawLayers = map
        .getStyle()
        .layers.filter((l) => l.id.startsWith(`${DRAW_LAYER_PREFIX}-`))
        .map((l) => l.id);
      if (
        drawLayers.length &&
        map.queryRenderedFeatures(e.point, { layers: drawLayers }).length
      )
        return;
      const hit = map
        .queryRenderedFeatures([e.point.x, e.point.y], {
          layers: CLICKABLE.filter((id) => map.getLayer(id)),
        })
        .at(0);
      const id = hit?.properties?.componentId;
      useStore.getState().selectComponent(typeof id === "string" ? id : null);
    };
    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const unpointer = () => {
      map.getCanvas().style.cursor = "";
      tooltip.current?.remove();
    };
    // Hover tooltip with the component's name, size and cost (P3.3). Created
    // synchronously from a preloaded class: an await here let two mouse moves
    // each create one, leaving an untracked copy stuck on the map.
    let PopupClass: typeof Popup | null = null;
    void import("maplibre-gl").then((m) => (PopupClass = m.Popup));
    const onMove = (e: MapMouseEvent) => {
      // Hidden while drawing, or while a button is held (dragging a shape or vertex).
      if (useStore.getState().drawing || e.originalEvent.buttons !== 0)
        return void tooltip.current?.remove();
      const hit = map
        .queryRenderedFeatures(e.point, {
          layers: CLICKABLE.filter((id) => map.getLayer(id)),
        })
        .at(0);
      const id = hit?.properties?.componentId;
      const c = useStore.getState().components.find((x) => x.id === id);
      if (!c) return void tooltip.current?.remove();
      const info = costRef.current?.get(c.id);
      const size = formatMeasurements(
        measureComponent(c),
        useStore.getState().unitSystem,
        labels.current.locale,
        labels.current.measureWords,
      );
      const cost = info
        ? `${labels.current.money(info.p50)} · ${Math.round(info.share * 100)}%`
        : labels.current.noCost;
      const text = [c.name, size, cost].filter(Boolean).join(" · ");
      if (!tooltip.current) {
        if (!PopupClass) return;
        tooltip.current = new PopupClass({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "pw-tooltip",
        });
      }
      tooltip.current.setLngLat(e.lngLat).setText(text).addTo(map);
    };
    const hide = () => tooltip.current?.remove();
    map.on("mousemove", onMove);
    map.on("mousedown", hide);
    map.on("click", onClick);
    const subs = CLICKABLE.flatMap((layer) => [
      map.on("mouseenter", layer, pointer),
      map.on("mouseleave", layer, unpointer),
    ]);
    return () => {
      map.off("style.load", onStyle);
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.off("mousedown", hide);
      tooltip.current?.remove();
      tooltip.current = null;
      subs.forEach((s) => s.unsubscribe());
    };
  }, [map]);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SOURCE)?.setData({
      type: "FeatureCollection",
      features: toFeatures(components, colourByCost ? cost : null),
    });
  }, [map, components, colourByCost, cost]);

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
    map.setPaintProperty("pw-extrusion", "fill-extrusion-color", [
      "case",
      ["==", ["get", "componentId"], selectedId ?? ""],
      mapColors.selected,
      ["get", "color"],
    ]);
    map.setFilter("pw-selected-point", [
      "all",
      isPoint,
      selectedFilter(selectedId),
    ]);
  }, [map, selectedId, components]);

  // Hovering a component elsewhere (the bar chart) lights it up here.
  const hoveredId = useStore((s) => s.hoveredComponentId);
  useEffect(() => {
    if (!map?.getLayer("pw-hover-line")) return;
    map.setFilter("pw-hover-fill", [
      "all",
      isPolygon,
      selectedFilter(hoveredId),
    ]);
    map.setFilter("pw-hover-line", [
      "all",
      ["!=", ["geometry-type"], "Point"],
      selectedFilter(hoveredId),
    ]);
    map.setFilter("pw-hover-point", [
      "all",
      isPoint,
      selectedFilter(hoveredId),
    ]);
  }, [map, hoveredId, components]);

  return (
    <>
      <PlanLayers map={map} beforeId="pw-area" />
      <MeasurementLabels map={map} />
      <IssueHighlights map={map} estimate={estimate} />
      <WarningMarkers map={map} />
    </>
  );
}
