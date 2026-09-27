"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { parkFeatures } from "@/data";
import type { Component, Position } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// The selected component's parts, named on the map just above each one: park
// features ("Playground", a custom "Skate park") and building sections
// ("Section 2 · 3 storeys"). Only while it's selected, so the map stays calm.

const SOURCE = "pw-feature-labels";

/** A catalog name without its pricing note: "Skate park (per m²)" → "Skate park". */
const plain = (label: string) => label.replace(/\s*\(per [^)]*\)/g, "");

/** Just above a shape: the top-centre of a polygon, the middle of a line, the point. */
function above(g: { type: string; coordinates: unknown }): Position | null {
  if (g.type === "Point") return g.coordinates as Position;
  if (g.type === "LineString") {
    const line = g.coordinates as Position[];
    return line[Math.floor(line.length / 2)] ?? null;
  }
  if (g.type === "Polygon") {
    const ring = (g.coordinates as Position[][])[0] ?? [];
    if (!ring.length) return null;
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys)];
  }
  return null;
}

type Label = { at: Position; text: string };

function labelsFor(
  c: Component | undefined,
  sectionText: (name: string | undefined, n: number, storeys: number) => string,
): Label[] {
  if (!c?.geometry || !c.visible) return [];
  const out: Label[] = [];
  const catalog = parkFeatures.features as Record<
    string,
    { label: { en: string } }
  >;
  for (const f of c.geometry.features) {
    const at = above(f.geometry.geometry);
    const name =
      f.kind === "custom"
        ? f.customLabel
        : plain(catalog[f.kind]?.label.en ?? f.kind.replace(/_/g, " "));
    if (at && name) out.push({ at, text: name });
  }
  const sections = c.geometry.sections ?? [];
  if (sections.length > 1)
    sections.forEach((s, i) => {
      const at = above(s.footprint.geometry);
      const use = s.use?.trim();
      const name = use ? use.charAt(0).toUpperCase() + use.slice(1) : undefined;
      if (at) out.push({ at, text: sectionText(name, i + 1, s.storeys) });
    });
  return out;
}

function addLayer(map: MapLibreMap) {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: SOURCE,
    type: "symbol",
    source: SOURCE,
    minzoom: 14.5,
    layout: {
      "text-field": ["get", "text"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      // Sits on the shape's top edge; nudged below or aside when two collide.
      "text-variable-anchor": ["bottom", "top", "left", "right"],
      "text-radial-offset": 0.4,
      "text-allow-overlap": false,
      "text-max-width": 12,
    },
    paint: {
      "text-color": "#111827",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });
}

export function FeatureLabels({ map }: { map: MapLibreMap | null }) {
  const t = useTranslations("design.featureLabels");
  const selected = useStore((s) =>
    s.components.find((c) => c.id === s.selectedComponentId),
  );
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: labelsFor(selected, (name, n, storeys) =>
        t("section", { name: name ?? t("sectionN", { n }), storeys }),
      ).map((l) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: l.at },
        properties: { text: l.text },
      })),
    }),
    [selected, t],
  );

  useEffect(() => {
    if (!map) return;
    const update = () => {
      addLayer(map);
      map.getSource<GeoJSONSource>(SOURCE)?.setData(data);
    };
    update();
    map.on("style.load", update);
    return () => {
      map.off("style.load", update);
    };
  }, [map, data]);

  return null;
}
