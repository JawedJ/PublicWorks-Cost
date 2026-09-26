"use client";

import { useTranslations } from "next-intl";
import { availableBasemaps, type BasemapId } from "@/lib/geo/basemaps";
import { cn } from "@/lib/utils";
import { MAP_SEGMENTED, MAP_TOGGLE_ON } from "./toggle-styles";

/** Segmented switch between street map and satellite imagery. */
export function BasemapToggle({
  value,
  onChange,
}: {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
}) {
  const t = useTranslations("map.basemap");
  if (availableBasemaps.length < 2) return null;

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn(
        "flex overflow-hidden rounded-md border text-xs shadow-sm",
        MAP_SEGMENTED,
      )}
    >
      {availableBasemaps.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "px-3 py-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === id ? MAP_TOGGLE_ON : "hover:bg-zinc-100",
          )}
        >
          {t(id)}
        </button>
      ))}
    </div>
  );
}
