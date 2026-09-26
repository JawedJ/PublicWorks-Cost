"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback } from "react";
import { componentBounds } from "@/lib/geo/bounds";
import { useStore } from "@/lib/store/store";
import { useMap } from "./map-context";

// Map snapshot for reports (P5.1). Reads the canvas during a render, so the map
// doesn't need `preserveDrawingBuffer`. Returns a PNG data URL.

export async function captureMapSnapshot(
  map: MapLibreMap,
  opts: { fitProject?: boolean } = {},
): Promise<string> {
  if (opts.fitProject) {
    const all = useStore
      .getState()
      .components.map(componentBounds)
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (all.length) {
      map.fitBounds(
        [
          Math.min(...all.map((b) => b[0])),
          Math.min(...all.map((b) => b[1])),
          Math.max(...all.map((b) => b[2])),
          Math.max(...all.map((b) => b[3])),
        ],
        { padding: 40, duration: 0 },
      );
      await new Promise<void>((r) => map.once("idle", () => r()));
    }
  }
  return new Promise((resolve) => {
    map.once("render", () => resolve(map.getCanvas().toDataURL("image/png")));
    map.triggerRepaint();
  });
}

/** For report exports inside the workspace: `const snap = useMapSnapshot(); const png = await snap();` */
export function useMapSnapshot() {
  const map = useMap();
  return useCallback(
    async (opts?: { fitProject?: boolean }) =>
      map ? captureMapSnapshot(map, opts) : null,
    [map],
  );
}
