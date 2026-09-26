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
import { useMap, useSetMap } from "./map-context";
import { RotateControl } from "./rotate-control";

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
  const loadedMap = useMap();
  const unitSystem = useStore((s) => s.unitSystem);
  const [basemap, setBasemap] = useState<BasemapId>("streets");
  const [failed, setFailed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const rotateRef = useRef<RotateControl | null>(null);

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
        },
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      // Rotate mode replaces the compass: toggle it, then drag anywhere to turn the map.
      const rotate = new RotateControl(t("rotateMode"), () =>
        setRotating((on) => !on),
      );
      map.addControl(rotate, "top-right");
      rotateRef.current = rotate;
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

  useEffect(() => {
    rotateRef.current?.setActive(rotating);
    if (!rotating) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setRotating(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotating]);

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
      {rotating && loadedMap && (
        <RotateOverlay map={loadedMap} hint={t("rotateHint")} />
      )}
      <div className="absolute right-12 bottom-8">
        <BasemapToggle value={basemap} onChange={changeBasemap} />
      </div>
      {children}
    </div>
  );
}

/**
 * Covers the map while rotate mode is on (so drawing and selection pause): dragging
 * anywhere turns the map around its centre, following the pointer like a dial.
 */
function RotateOverlay({ map, hint }: { map: MapLibreMap; hint: string }) {
  const start = useRef<{ angle: number; bearing: number } | null>(null);
  const angleAt = (el: HTMLElement, e: React.PointerEvent) => {
    const r = el.getBoundingClientRect();
    return (
      (Math.atan2(
        e.clientY - (r.top + r.height / 2),
        e.clientX - (r.left + r.width / 2),
      ) *
        180) /
      Math.PI
    );
  };
  return (
    <div
      className="absolute inset-0 z-[1] cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = {
          angle: angleAt(e.currentTarget, e),
          bearing: map.getBearing(),
        };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        // Turning clockwise on screen turns the map clockwise (bearing decreases).
        map.setBearing(
          start.current.bearing -
            (angleAt(e.currentTarget, e) - start.current.angle),
        );
      }}
      onPointerUp={() => (start.current = null)}
      // Scroll still zooms while rotating.
      onWheel={(e) => map.setZoom(map.getZoom() - e.deltaY / 300)}
    >
      <p className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-md bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
        {hint}
      </p>
    </div>
  );
}
