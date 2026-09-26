"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { formatArea, formatLength } from "@/lib/geo/format";
import { measureComponent } from "@/lib/geo/measure";
import { intlLocale, type Locale } from "@/lib/i18n/routing";
import type { Component, Position } from "@/lib/schemas";
import type { UnitSystem } from "@/lib/store/designSlice";
import { useStore } from "@/lib/store/store";

// Live measurement labels on the map (P1.15): each drawn component shows its key
// measurement (road length, park area, building floor area) at its middle.

const SOURCE = "pw-labels";

function anchor(c: Component): Position | null {
  const g = c.geometry?.primary.geometry;
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  if (g.type === "LineString")
    return g.coordinates[Math.floor(g.coordinates.length / 2)]!;
  const ring = g.coordinates[0]!;
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function labelText(c: Component, units: UnitSystem, locale: string): string {
  const m = measureComponent(c);
  if (c.type === "building" && m.grossFloorAreaM2 !== undefined)
    return formatArea(m.grossFloorAreaM2, units, locale);
  if (m.lengthM !== undefined) return formatLength(m.lengthM, units, locale);
  if (m.areaM2 !== undefined) return formatArea(m.areaM2, units, locale);
  return "";
}

function data(components: Component[], units: UnitSystem, locale: string) {
  return {
    type: "FeatureCollection" as const,
    features: components.flatMap((c) => {
      const at = c.visible ? anchor(c) : null;
      const text = at ? labelText(c, units, locale) : "";
      if (!at || !text) return [];
      return [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: at },
          properties: { name: c.name, text },
        },
      ];
    }),
  };
}

function addLayer(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  const { components, unitSystem } = useStore.getState();
  map.addSource(SOURCE, {
    type: "geojson",
    data: data(components, unitSystem, "en-CA"),
  });
  map.addLayer({
    id: "pw-labels",
    type: "symbol",
    source: SOURCE,
    minzoom: 14,
    layout: {
      "text-field": [
        "format",
        ["get", "name"],
        {},
        "\n",
        {},
        ["get", "text"],
        { "font-scale": 0.9 },
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#1f2937",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });
}

export function MeasurementLabels({ map }: { map: MapLibreMap | null }) {
  const locale = intlLocale[useLocale() as Locale];
  const components = useStore((s) => s.components);
  const units = useStore((s) => s.unitSystem);

  useEffect(() => {
    if (!map) return;
    const add = () => {
      addLayer(map);
      map
        .getSource<GeoJSONSource>(SOURCE)
        ?.setData(
          data(
            useStore.getState().components,
            useStore.getState().unitSystem,
            locale,
          ),
        );
    };
    add();
    map.on("style.load", add);
    return () => {
      map.off("style.load", add);
    };
  }, [map, locale]);

  useEffect(() => {
    map
      ?.getSource<GeoJSONSource>(SOURCE)
      ?.setData(data(components, units, locale));
  }, [map, components, units, locale]);

  return null;
}
