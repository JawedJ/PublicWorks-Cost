"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { createContext, useContext, useState } from "react";

type MapContextValue = {
  map: MapLibreMap | null;
  setMap: (map: MapLibreMap | null) => void;
};

const MapContext = createContext<MapContextValue | null>(null);

/** Shares the MapLibre instance with map tools (search, drawing, layers). */
export function MapProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  return <MapContext value={{ map, setMap }}>{children}</MapContext>;
}

/** The map instance, or `null` until it has loaded. */
export function useMap(): MapLibreMap | null {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMap must be used inside <MapProvider>");
  return ctx.map;
}

export function useSetMap() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useSetMap must be used inside <MapProvider>");
  return ctx.setMap;
}
