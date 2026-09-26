"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { componentBounds, featureBounds } from "@/lib/geo/bounds";
import { pxPerMetreZ0 } from "@/lib/render/plan";
import { SiteContextSchema } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { useMap } from "./map-context";

// Site context (P6.2): looks up schools, hospitals, waterways and rail around the
// project (via /api/geo/context) and shows them with buffer rings on the map.

const SOURCE = "pw-site";
/** Largest search box the API accepts (degrees of longitude, latitude), a bit under its limit. */
const MAX_SPAN = [0.075, 0.055] as const;
/** Buffer ring radius around schools and hospitals, and half-width along water and rail (m). */
const BUFFER_M = { school: 150, hospital: 150, waterway: 30, rail: 30 };
const COLOR = {
  school: "#7c3aed",
  hospital: "#dc2626",
  waterway: "#0284c7",
  rail: "#57534e",
};

function projectBbox(pad = 0.004): [number, number, number, number] | null {
  const { components, areaBoundary } = useStore.getState();
  const boxes = [
    ...components.map(componentBounds),
    areaBoundary ? featureBounds(areaBoundary) : null,
  ].filter((b): b is NonNullable<typeof b> => b !== null);
  if (!boxes.length) return null;
  const w = Math.min(...boxes.map((b) => b[0])) - pad;
  const s = Math.min(...boxes.map((b) => b[1])) - pad;
  const e = Math.max(...boxes.map((b) => b[2])) + pad;
  const n = Math.max(...boxes.map((b) => b[3])) + pad;
  // The API looks at most ~5 km across; a larger project checks the area around its centre.
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hw = Math.min((e - w) / 2, MAX_SPAN[0] / 2);
  const hh = Math.min((n - s) / 2, MAX_SPAN[1] / 2);
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}

function addLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  const metres = (m: string) =>
    [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      0,
      ["*", ["get", m], ["get", "k0"]],
      24,
      ["*", ["get", m], ["get", "k0"], 16_777_216],
    ] as never;
  const first = map.getStyle().layers.find((l) => l.id.startsWith("plan-"))?.id;
  map.addLayer(
    {
      id: "pw-site-buffer-line",
      type: "line",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      // Round joins: the wide buffer band otherwise spikes into long triangles at sharp bends.
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.12,
        "line-width": metres("bufferW"),
      },
    },
    first,
  );
  map.addLayer(
    {
      id: "pw-site-line",
      type: "line",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
    },
    first,
  );
  map.addLayer(
    {
      id: "pw-site-ring",
      type: "circle",
      source: SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": metres("bufferM"),
        "circle-color": ["get", "color"],
        "circle-opacity": 0.08,
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.6,
      },
    },
    first,
  );
  map.addLayer({
    id: "pw-site-point",
    type: "circle",
    source: SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.5,
    },
  });
}

/** Map overlays for the project's site context. Renders nothing itself. */
export function SiteLayers({ map }: { map: MapLibreMap | null }) {
  const site = useStore((s) => s.project.siteContext);
  useEffect(() => {
    if (!map) return;
    const features = (site?.features ?? [])
      .filter((f) => f.kind !== "road" && f.kind !== "floodplain")
      .map((f) => {
        const kind = f.kind as keyof typeof BUFFER_M;
        const g = f.geometry.geometry;
        const lat =
          g.type === "Point"
            ? g.coordinates[1]
            : g.type === "LineString"
              ? g.coordinates[0]![1]
              : 45;
        return {
          type: "Feature" as const,
          geometry: g,
          properties: {
            color: COLOR[kind],
            bufferM: BUFFER_M[kind],
            bufferW: BUFFER_M[kind] * 2,
            k0: pxPerMetreZ0(lat),
            name: f.name ?? "",
          },
        };
      });
    const add = () => {
      addLayers(map);
      map
        .getSource<GeoJSONSource>(SOURCE)
        ?.setData({ type: "FeatureCollection", features });
    };
    add();
    map.on("style.load", add);
    return () => {
      map.off("style.load", add);
    };
  }, [map, site]);
  return null;
}

/** Inspector section: look up site context and summarize it. */
export function SiteContextPanel() {
  const t = useTranslations("map.site");
  const map = useMap();
  const site = useStore((s) => s.project.siteContext);
  const hasDesign = useStore((s) => s.components.some((c) => c.geometry));
  const [loading, setLoading] = useState(false);

  async function check() {
    const bbox = projectBbox();
    if (!bbox) return;
    setLoading(true);
    try {
      const res = await fetch("/api/geo/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bbox }),
      });
      const parsed = SiteContextSchema.safeParse(await res.json());
      useStore.getState().setSiteContext(
        parsed.success
          ? parsed.data
          : {
              source: "unavailable",
              fetchedAt: new Date().toISOString(),
              features: [],
            },
      );
    } catch {
      useStore.getState().setSiteContext({
        source: "unavailable",
        fetchedAt: new Date().toISOString(),
        features: [],
      });
    } finally {
      setLoading(false);
    }
  }

  const count = (k: string) =>
    site?.features.filter((f) => f.kind === k).length ?? 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-semibold">{t("title")}</h4>
        <Button
          variant="outline"
          size="xs"
          disabled={!hasDesign || loading || !map}
          onClick={check}
        >
          {loading ? t("checking") : site ? t("recheck") : t("check")}
        </Button>
      </div>
      {site?.source === "unavailable" && (
        <p className="text-muted-foreground">{t("unavailable")}</p>
      )}
      {site && site.source !== "unavailable" && (
        <p className="text-muted-foreground">
          {t("summary", {
            schools: count("school"),
            hospitals: count("hospital"),
            water: count("waterway"),
            rail: count("rail"),
          })}
        </p>
      )}
    </div>
  );
}
