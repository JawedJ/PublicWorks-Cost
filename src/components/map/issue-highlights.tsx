"use client";

import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Popup,
} from "maplibre-gl";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";
import { issueHighlights } from "@/lib/geo/issues";
import type { Estimate } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// "Things to check" on the map: the existing buildings to demolish, the creek or
// rail line that triggers a permit, the school or hospital nearby, each linked to
// its component with a dashed line and the distance. Hover shows the flag.

const SOURCE = "pw-issues";
const SEVERITY_COLOR: ExpressionSpecification = [
  "match",
  ["get", "severity"],
  "high",
  "#dc2626",
  "warning",
  "#d97706",
  "#2563eb",
];
const DEMOLISH = "#ef4444";
const LAYERS = [
  "pw-issues-area",
  "pw-issues-area-line",
  "pw-issues-glow",
  "pw-issues-line",
  "pw-issues-point",
  "pw-issues-link",
  "pw-issues-link-label",
] as const;
const HOVERABLE = [
  "pw-issues-area",
  "pw-issues-glow",
  "pw-issues-point",
  "pw-issues-link",
];

function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  const role = (r: string): FilterSpecification => ["==", ["get", "role"], r];
  map.addLayer({
    id: "pw-issues-area",
    type: "fill",
    source: SOURCE,
    filter: role("area"),
    paint: { "fill-color": DEMOLISH, "fill-opacity": 0.3 },
  });
  map.addLayer({
    id: "pw-issues-area-line",
    type: "line",
    source: SOURCE,
    filter: role("area"),
    paint: {
      "line-color": DEMOLISH,
      "line-width": 2,
      "line-dasharray": [2, 1.5],
    },
  });
  map.addLayer({
    id: "pw-issues-glow",
    type: "line",
    source: SOURCE,
    filter: role("line"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": SEVERITY_COLOR,
      "line-width": 14,
      "line-opacity": 0.3,
    },
  });
  map.addLayer({
    id: "pw-issues-line",
    type: "line",
    source: SOURCE,
    filter: role("line"),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": SEVERITY_COLOR, "line-width": 3 },
  });
  map.addLayer({
    id: "pw-issues-point",
    type: "circle",
    source: SOURCE,
    filter: role("point"),
    paint: {
      "circle-radius": 11,
      "circle-color": SEVERITY_COLOR,
      "circle-opacity": 0.25,
      "circle-stroke-color": SEVERITY_COLOR,
      "circle-stroke-width": 2.5,
    },
  });
  map.addLayer({
    id: "pw-issues-link",
    type: "line",
    source: SOURCE,
    filter: role("link"),
    paint: {
      "line-color": SEVERITY_COLOR,
      "line-width": 2,
      "line-dasharray": [1.5, 1.5],
    },
  });
  map.addLayer({
    id: "pw-issues-link-label",
    type: "symbol",
    source: SOURCE,
    filter: role("link"),
    layout: {
      "symbol-placement": "line-center",
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-allow-overlap": true,
      "text-offset": [0, -0.9],
    },
    paint: {
      "text-color": SEVERITY_COLOR,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });
}

export function IssueHighlights({
  map,
  estimate,
}: {
  map: MapLibreMap | null;
  estimate: Estimate | null;
}) {
  const locale = useLocale() as "en" | "fr";
  const components = useStore((s) => s.components);
  const site = useStore((s) => s.project.siteContext);
  const show = useStore((s) => s.showIssues);
  const focus = useStore((s) => s.flagFocus);
  const viewMode = useStore((s) => s.viewMode);
  const tooltip = useRef<Popup | null>(null);

  // Data and visibility.
  useEffect(() => {
    if (!map) return;
    const update = () => {
      addLayers(map);
      map.getSource<GeoJSONSource>(SOURCE)?.setData({
        type: "FeatureCollection",
        features: issueHighlights(
          components,
          // A clicked entry shows just that issue (even with the toggle off).
          focus
            ? (estimate?.flags ?? [])
                .filter((f) => f.code === focus.code)
                .map((f) => ({
                  ...f,
                  componentIds: f.componentIds.filter((id) =>
                    focus.componentIds.includes(id),
                  ),
                }))
            : (estimate?.flags ?? []),
          site,
          locale,
        ),
      });
      const visible =
        (show || focus) && viewMode !== "site3d" ? "visible" : "none";
      for (const id of LAYERS)
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible);
    };
    update();
    map.on("style.load", update);
    return () => {
      map.off("style.load", update);
    };
  }, [map, estimate, components, site, locale, show, focus, viewMode]);

  // Hover: what the highlight is about.
  useEffect(() => {
    if (!map) return;
    let PopupClass: typeof Popup | null = null;
    void import("maplibre-gl").then((m) => (PopupClass = m.Popup));
    const onMove = (e: MapMouseEvent) => {
      if (useStore.getState().drawing || e.originalEvent.buttons !== 0)
        return void tooltip.current?.remove();
      const hit = map
        .queryRenderedFeatures(e.point, {
          layers: HOVERABLE.filter((id) => map.getLayer(id)),
        })
        .at(0);
      if (!hit) return void tooltip.current?.remove();
      const { title, detail } = hit.properties as {
        title: string;
        detail: string;
      };
      const short = detail.length > 220 ? `${detail.slice(0, 217)}…` : detail;
      if (!tooltip.current) {
        if (!PopupClass) return;
        tooltip.current = new PopupClass({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          maxWidth: "280px",
          className: "pw-tooltip",
        });
      }
      tooltip.current
        .setLngLat(e.lngLat)
        .setText(`${title}: ${short}`)
        .addTo(map);
    };
    const hide = () => tooltip.current?.remove();
    map.on("mousemove", onMove);
    map.on("mousedown", hide);
    return () => {
      map.off("mousemove", onMove);
      map.off("mousedown", hide);
      tooltip.current?.remove();
    };
  }, [map]);

  return null;
}
