"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, ScaleControl } from "maplibre-gl";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  basemapStyleUrl,
  defaultView,
  type BasemapId,
} from "@/lib/geo/basemaps";
import { useStore } from "@/lib/store/store";
import { BasemapToggle } from "./basemap-toggle";
import { useSetMap } from "./map-context";

// MapLibre 6 loads its worker from a separate module; it is copied into
// /public/maplibre by the `copy:maplibre` script (see package.json).
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/** The MapLibre map: basemap, navigation and scale controls. */
export function MapView({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("map");
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const scaleRef = useRef<ScaleControl | null>(null);
  const setMap = useSetMap();
  const unitSystem = useStore((s) => s.unitSystem);
  const [basemap, setBasemap] = useState<BasemapId>("streets");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      maplibregl.setWorkerUrl(WORKER_URL);

      map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyleUrl("streets"),
        center: [defaultView.lng, defaultView.lat],
        zoom: defaultView.zoom,
        attributionControl: { compact: true },
        locale: {
          "NavigationControl.ZoomIn": t("zoomIn"),
          "NavigationControl.ZoomOut": t("zoomOut"),
          "NavigationControl.ResetBearing": t("resetBearing"),
        },
      });
      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true }),
        "top-right",
      );
      const scale = new maplibregl.ScaleControl({ maxWidth: 120 });
      map.addControl(scale, "bottom-left");
      scaleRef.current = scale;
      mapRef.current = map;

      map.once("load", () => {
        if (!cancelled) setMap(map);
      });
      map.on("error", (e) => {
        // Style or tile failures: keep the app usable, show a notice.
        console.warn("[map]", e.error?.message);
        if (!map?.isStyleLoaded()) setFailed(true);
      });
    })();

    return () => {
      cancelled = true;
      setMap(null);
      map?.remove();
      mapRef.current = null;
      scaleRef.current = null;
    };
    // The map is created once; locale-dependent labels don't recreate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMap]);

  useEffect(() => {
    scaleRef.current?.setUnit(unitSystem);
  }, [unitSystem]);

  function changeBasemap(id: BasemapId) {
    setBasemap(id);
    mapRef.current?.setStyle(basemapStyleUrl(id));
  }

  return (
    <div className="relative h-full w-full" lang={locale}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label={t("mapLabel")}
      />
      {failed && (
        <p className="absolute inset-x-4 top-4 rounded-md bg-card p-3 text-sm shadow">
          {t("loadError")}
        </p>
      )}
      <div className="absolute right-12 bottom-8">
        <BasemapToggle value={basemap} onChange={changeBasemap} />
      </div>
      {children}
    </div>
  );
}
