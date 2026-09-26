"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import type { Estimate, Position } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { anchor } from "./measurement-labels";

// Flag markers on the map (P3.9a): one marker per place with the number of flags,
// coloured by the most severe. B's estimate panel lists the flags themselves.

const SOURCE = "pw-flags";
const SEVERITY = { info: 0, warning: 1, high: 2 } as const;
const COLORS = ["#2563eb", "#d97706", "#dc2626"];

function data(estimate: Estimate | null, locale: "en" | "fr") {
  const byPlace = new Map<
    string,
    { at: Position; titles: string[]; sev: number }
  >();
  const components = useStore.getState().components;
  for (const f of estimate?.flags ?? []) {
    let at: Position | null = f.location
      ? [f.location.lng, f.location.lat]
      : null;
    if (!at) {
      const c = components.find((x) => x.id === f.componentIds[0]);
      at = c?.visible ? anchor(c) : null;
    }
    if (!at) continue;
    const key = at.join(",");
    const entry = byPlace.get(key) ?? { at, titles: [], sev: 0 };
    if (!entry.titles.includes(f.title[locale]))
      entry.titles.push(f.title[locale]);
    entry.sev = Math.max(entry.sev, SEVERITY[f.severity]);
    byPlace.set(key, entry);
  }
  return {
    type: "FeatureCollection" as const,
    features: [...byPlace.values()].map((e) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: e.at },
      properties: {
        count: String(e.titles.length),
        color: COLORS[e.sev],
        titles: e.titles.join("\n"),
      },
    })),
  };
}

function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "pw-flags",
    type: "circle",
    source: SOURCE,
    paint: {
      "circle-radius": 9,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-translate": [14, -14],
    },
  });
  map.addLayer({
    id: "pw-flags-count",
    type: "symbol",
    source: SOURCE,
    layout: {
      "text-field": ["get", "count"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-allow-overlap": true,
      "text-offset": [1.27, -1.27],
    },
    paint: { "text-color": "#ffffff" },
  });
}

export function FlagMarkers({
  map,
  estimate,
}: {
  map: MapLibreMap | null;
  estimate: Estimate | null;
}) {
  const locale = useLocale() as "en" | "fr";
  const components = useStore((s) => s.components);

  useEffect(() => {
    if (!map) return;
    const add = () => {
      addLayers(map);
      map.getSource<GeoJSONSource>(SOURCE)?.setData(data(estimate, locale));
    };
    add();
    map.on("style.load", add);
    return () => {
      map.off("style.load", add);
    };
  }, [map, estimate, locale, components]);

  return null;
}
