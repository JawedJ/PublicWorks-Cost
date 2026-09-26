"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { designWarnings } from "@/lib/geo/warnings";
import { useStore } from "@/lib/store/store";

// Advisory design warnings (P1.16) as small amber "!" markers on the map.

const SOURCE = "pw-warnings";

export function useDesignWarnings() {
  const components = useStore((s) => s.components);
  const area = useStore((s) => s.areaBoundary);
  return useMemo(() => designWarnings(components, area), [components, area]);
}

function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "pw-warnings",
    type: "circle",
    source: SOURCE,
    paint: {
      "circle-radius": 8,
      "circle-color": "#f59e0b",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "pw-warnings-mark",
    type: "symbol",
    source: SOURCE,
    layout: {
      "text-field": "!",
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  });
}

export function WarningMarkers({ map }: { map: MapLibreMap | null }) {
  const warnings = useDesignWarnings();
  useEffect(() => {
    if (!map) return;
    const add = () => {
      addLayers(map);
      map.getSource<GeoJSONSource>(SOURCE)?.setData({
        type: "FeatureCollection",
        features: warnings.map((w) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: w.location },
          properties: { id: w.id },
        })),
      });
    };
    add();
    map.on("style.load", add);
    return () => {
      map.off("style.load", add);
    };
  }, [map, warnings]);
  return null;
}
