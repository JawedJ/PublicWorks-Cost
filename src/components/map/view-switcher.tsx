"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { ViewMode } from "@/lib/store/designSlice";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";
import { useMap } from "./map-context";

const VIEWS = ["plan2d", "map3d"] as const satisfies ViewMode[];

/** Switch between the 2D plan and the 3D map (tilted, buildings extruded). */
export function ViewSwitcher() {
  const t = useTranslations("map.views");
  const map = useMap();
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);

  useEffect(() => {
    if (!map) return;
    if (viewMode === "map3d")
      map.easeTo({ pitch: 60, bearing: -20, duration: 600 });
    else map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }, [map, viewMode]);

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="flex overflow-hidden rounded-md border bg-card text-xs shadow-sm"
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
            viewMode === v ? "bg-foreground text-background" : "hover:bg-muted",
          )}
        >
          {t(v)}
        </button>
      ))}
    </div>
  );
}
