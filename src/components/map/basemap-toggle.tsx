"use client";

import { useTranslations } from "next-intl";
import { availableBasemaps, type BasemapId } from "@/lib/geo/basemaps";
import { cn } from "@/lib/utils";

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
      className="flex overflow-hidden rounded-md border bg-card text-xs shadow-sm"
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
            value === id ? "bg-foreground text-background" : "hover:bg-muted",
          )}
        >
          {t(id)}
        </button>
      ))}
    </div>
  );
}
