"use client";

import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store/store";
import { useMap } from "./map-context";

// Zoning map layer (SPEC 8.3, Waterloo only): zone polygons from B's committed
// snapshot via /api/zoning/map, coloured by zone family, drawn under the design.
// Reloaded for the visible area as the map moves; click a zone for its code.

const SOURCE = "pw-zoning";
const FILL = "pw-zoning-fill";
const LINE = "pw-zoning-line";

/** Zone families grouped into a few readable colours. */
const GROUPS = [
  {
    key: "residential",
    color: "#f2c94c",
    families: ["Residential", "Residential Northdale"],
  },
  {
    key: "mixedUse",
    color: "#f2994a",
    families: ["Residential Mixed-Use", "Uptown"],
  },
  { key: "commercial", color: "#eb5757", families: ["Commercial"] },
  {
    key: "employment",
    color: "#9b51e0",
    families: ["Employment", "Waste Management"],
  },
  {
    key: "openSpace",
    color: "#27ae60",
    families: ["Open Space", "Environmentally Sensitive Landscape"],
  },
  {
    key: "institutional",
    color: "#2f80ed",
    families: [
      "Institutional",
      "School",
      "Educational Institution",
      "University College",
    ],
  },
] as const;
const OTHER = "#9e9e9e";

const colorExpr = [
  "match",
  ["get", "family"],
  ...GROUPS.flatMap((g) => [[...g.families], g.color]),
  OTHER,
] as never;

/** The visible area, capped to the API's ~5 km box around the centre. */
function viewBox(map: MapLibreMap): [number, number, number, number] {
  const b = map.getBounds();
  const c = map.getCenter();
  const hw = Math.min((b.getEast() - b.getWest()) / 2, 0.034);
  const hh = Math.min((b.getNorth() - b.getSouth()) / 2, 0.024);
  return [c.lng - hw, c.lat - hh, c.lng + hw, c.lat + hh];
}

function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  // Under the plan, components and drawing layers.
  const before = map
    .getStyle()
    .layers.find((l) => /^(plan-|pw-|td-)/.test(l.id))?.id;
  map.addLayer(
    {
      id: FILL,
      type: "fill",
      source: SOURCE,
      paint: { "fill-color": colorExpr, "fill-opacity": 0.28 },
    },
    before,
  );
  map.addLayer(
    {
      id: LINE,
      type: "line",
      source: SOURCE,
      paint: { "line-color": colorExpr, "line-width": 1, "line-opacity": 0.8 },
    },
    before,
  );
}

function removeLayers(map: MapLibreMap) {
  for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
}

type Picked = { code: string; label?: string; family?: string };

export function ZoningLayer() {
  const t = useTranslations("map.zoning");
  const map = useMap();
  const on = useStore((s) => s.showZoning);
  const viewMode = useStore((s) => s.viewMode);
  const [count, setCount] = useState<number | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    if (!map || !on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let lastKey = "";
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const bbox = viewBox(map);
        const key = bbox.map((v) => v.toFixed(3)).join(",");
        if (key === lastKey) return;
        controller?.abort();
        controller = new AbortController();
        try {
          const res = await fetch("/api/zoning/map", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bbox }),
            signal: controller.signal,
          });
          if (!res.ok) return;
          const fc = (await res.json()) as GeoJSON.FeatureCollection;
          lastKey = key;
          addLayers(map);
          map.getSource<GeoJSONSource>(SOURCE)?.setData(fc);
          setCount(fc.features.length);
        } catch {
          // Aborted or offline: keep what's shown.
        }
      }, 300);
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (useStore.getState().drawing) return;
      const p = e.features?.[0]?.properties as Picked | undefined;
      if (p?.code) setPicked(p);
    };
    const onStyle = () => {
      lastKey = "";
      load();
    };
    addLayers(map);
    load();
    map.on("moveend", load);
    map.on("style.load", onStyle);
    map.on("click", FILL, onClick);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      map.off("moveend", load);
      map.off("style.load", onStyle);
      map.off("click", FILL, onClick);
      removeLayers(map);
      setCount(null);
      setPicked(null);
    };
  }, [map, on]);

  if (!on || viewMode === "site3d") return null;
  return (
    <div className="absolute bottom-10 left-3 z-10 w-56 rounded-md border bg-card/95 p-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold">{t("title")}</p>
      {picked && (
        <p className="mb-1.5 rounded bg-muted px-1.5 py-1">
          <span className="font-medium">{picked.code}</span>
          {picked.label && ` · ${picked.label}`}
          {picked.family && (
            <span className="text-muted-foreground"> ({picked.family})</span>
          )}
        </p>
      )}
      {count === 0 ? (
        <p className="text-muted-foreground">{t("noData")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {[...GROUPS, { key: "other" as const, color: OTHER }].map((g) => (
            <li key={g.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: g.color }}
              />
              {t(`groups.${g.key}`)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground">
        {t("source")}
      </p>
    </div>
  );
}
