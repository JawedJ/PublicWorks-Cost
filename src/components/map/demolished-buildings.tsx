"use client";

import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { existingBuildingsOn } from "@/engine/demolition";
import type { Position } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// Existing buildings the design demolishes disappear from the basemap. The site
// lookup's buildings are OpenStreetMap ways, and the basemap tiles use the same
// way ids, so the building layers (2D and 3D) filter them out by id. As a backup
// (a basemap that numbers features differently), their footprints are also
// painted over with the map's background colour, under labels and the design.

const SOURCE = "pw-demolished";
const MASK = "pw-demolished-mask";

type Removed = { ids: number[]; footprints: Position[][] };

function buildingLayers(map: MapLibreMap) {
  return map
    .getStyle()
    .layers.filter(
      (l) => "source-layer" in l && l["source-layer"] === "building",
    );
}

function apply(
  map: MapLibreMap,
  removed: Removed,
  original: Map<string, FilterSpecification | undefined>,
) {
  // 1. Hide them in the basemap's own building layers.
  for (const layer of buildingLayers(map)) {
    if (!original.has(layer.id))
      original.set(layer.id, map.getFilter(layer.id) ?? undefined);
    const base = original.get(layer.id);
    const keep: FilterSpecification = [
      "!",
      ["in", ["id"], ["literal", removed.ids]],
    ];
    const next = removed.ids.length
      ? ((base ? ["all", base, keep] : keep) as FilterSpecification)
      : (base ?? null);
    map.setFilter(layer.id, next);
  }

  // 2. Paint over the footprints, just under the first label layer.
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    const style = map.getStyle();
    const background = style.layers.find((l) => l.type === "background");
    const color =
      background && "paint" in background
        ? ((background.paint as Record<string, unknown> | undefined)?.[
            "background-color"
          ] ?? "#f5f3ef")
        : "#f5f3ef";
    const firstLabel = style.layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: MASK,
        type: "fill",
        source: SOURCE,
        paint: {
          "fill-color": color as string,
          "fill-antialias": true,
          "fill-outline-color": color as string,
        },
      },
      firstLabel,
    );
  }
  map.getSource<GeoJSONSource>(SOURCE)?.setData({
    type: "FeatureCollection",
    features: removed.footprints.map((ring) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    })),
  });
}

export function DemolishedBuildings({ map }: { map: MapLibreMap | null }) {
  const components = useStore((s) => s.components);
  const site = useStore((s) => s.project.siteContext);
  const original = useRef(new Map<string, FilterSpecification | undefined>());

  // Buildings in the way of anything whose "demolish existing buildings" is on.
  const removed = useMemo<Removed>(() => {
    const ids = new Set<string>();
    for (const c of components)
      if (c.visible && c.params.demolishExisting !== false)
        for (const id of existingBuildingsOn(c, site).ids) ids.add(id);
    const footprints: Position[][] = [];
    const numeric: number[] = [];
    for (const f of site?.features ?? []) {
      if (!ids.has(f.id) || f.geometry.geometry.type !== "Polygon") continue;
      footprints.push(f.geometry.geometry.coordinates[0]!);
      const n = Number(f.id.replace(/^way\//, ""));
      if (f.id.startsWith("way/") && Number.isFinite(n)) numeric.push(n);
    }
    return { ids: numeric, footprints };
  }, [components, site]);

  useEffect(() => {
    if (!map) return;
    const run = () => {
      // A new style brings fresh layers with their own filters.
      original.current.clear();
      apply(map, removed, original.current);
    };
    if (map.isStyleLoaded()) apply(map, removed, original.current);
    map.on("style.load", run);
    return () => {
      map.off("style.load", run);
    };
  }, [map, removed]);

  return null;
}
