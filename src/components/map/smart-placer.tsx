"use client";

import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect } from "react";
import { localFrame } from "@/lib/geo/transform";
import type { Position } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { markJustFinished } from "./draw-controller";
import { useMap } from "./map-context";

// Smart start (P1.9): while `smartPlacing` is set, the next map click drops a
// procedurally generated starting shape there, turned to face the nearest street.

/** Bearing (degrees, counter-clockwise from east) of the basemap street nearest to the click, or 0. */
function nearestStreetBearing(map: MapLibreMap, e: MapMouseEvent): number {
  const r = 80;
  const roadLayers = map
    .getStyle()
    .layers.filter(
      (l) => l.type === "line" && /road|street|highway|transport/i.test(l.id),
    )
    .map((l) => l.id);
  if (!roadLayers.length) return 0;
  const hits = map.queryRenderedFeatures(
    [
      [e.point.x - r, e.point.y - r],
      [e.point.x + r, e.point.y + r],
    ],
    { layers: roadLayers },
  );
  const at: Position = [e.lngLat.lng, e.lngLat.lat];
  const { toLocal } = localFrame(at);
  let best = Infinity;
  let bearing = 0;
  for (const f of hits) {
    const g = f.geometry;
    const lines =
      g.type === "LineString"
        ? [g.coordinates]
        : g.type === "MultiLineString"
          ? g.coordinates
          : [];
    for (const line of lines)
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = toLocal(line[i] as Position);
        const [x1, y1] = toLocal(line[i + 1] as Position);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, -(x0 * dx + y0 * dy) / len2));
        const d = Math.hypot(x0 + t * dx, y0 + t * dy);
        if (d < best) {
          best = d;
          bearing = (Math.atan2(dy, dx) * 180) / Math.PI;
        }
      }
  }
  return bearing;
}

export function SmartPlacer() {
  const map = useMap();
  const placing = useStore((s) => s.smartPlacing);

  useEffect(() => {
    if (!map || !placing) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    const onClick = (e: MapMouseEvent) => {
      markJustFinished();
      useStore
        .getState()
        .placeSmart([e.lngLat.lng, e.lngLat.lat], nearestStreetBearing(map, e));
    };
    map.once("click", onClick);
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [map, placing]);

  return null;
}
