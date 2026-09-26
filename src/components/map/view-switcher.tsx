"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { ViewMode } from "@/lib/store/designSlice";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";
import { useMap } from "./map-context";
import { MAP_SEGMENTED, MAP_TOGGLE_OFF, MAP_TOGGLE_ON } from "./toggle-styles";

const VIEWS = ["plan2d", "map3d", "site3d"] as const satisfies ViewMode[];

/** Switch between the 2D plan and the 3D map (tilted, buildings extruded). */
export function ViewSwitcher() {
  const t = useTranslations("map.views");
  const map = useMap();
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const colourByCost = useStore((s) => s.colourByCost);
  const setColourByCost = useStore((s) => s.setColourByCost);
  const showZoning = useStore((s) => s.showZoning);
  const setShowZoning = useStore((s) => s.setShowZoning);
  const showIssues = useStore((s) => s.showIssues);
  const setShowIssues = useStore((s) => s.setShowIssues);

  useEffect(() => {
    if (!map) return;
    if (viewMode === "site3d") return;
    if (viewMode === "map3d")
      map.easeTo({ pitch: 60, bearing: -20, duration: 600 });
    else map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }, [map, viewMode]);

  return (
    // View switcher on top; the map toggles (colour by cost, zoning) underneath.
    <div className="flex flex-col items-end gap-2">
      <div
        role="radiogroup"
        aria-label={t("label")}
        className={cn(
          "flex overflow-hidden rounded-md border text-xs shadow-sm",
          MAP_SEGMENTED,
        )}
      >
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={viewMode === v}
            onClick={() => setViewMode(v)}
            className={cn(
              "px-3 py-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              viewMode === v ? MAP_TOGGLE_ON : "hover:bg-zinc-100",
            )}
          >
            {t(v)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={colourByCost}
          onClick={() => setColourByCost(!colourByCost)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            colourByCost ? MAP_TOGGLE_ON : MAP_TOGGLE_OFF,
          )}
        >
          {t("colourByCost")}
        </button>
        {viewMode !== "site3d" && (
          <button
            type="button"
            aria-pressed={showZoning}
            onClick={() => setShowZoning(!showZoning)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              showZoning ? MAP_TOGGLE_ON : MAP_TOGGLE_OFF,
            )}
          >
            {t("zoning")}
          </button>
        )}
        {viewMode !== "site3d" && (
          <button
            type="button"
            aria-pressed={showIssues}
            title={t("issuesHint")}
            onClick={() => setShowIssues(!showIssues)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              showIssues ? MAP_TOGGLE_ON : MAP_TOGGLE_OFF,
            )}
          >
            {t("issues")}
          </button>
        )}
      </div>
    </div>
  );
}
