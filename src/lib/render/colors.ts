import type { ComponentType } from "@/lib/schemas";

// Map colours as hex, because MapLibre can't parse the oklch design tokens in
// globals.css. Converted from the light-theme tokens; keep them in sync.
export const mapColors = {
  water: "#1380c7",
  park: "#479c4d",
  pavement: "#7d8086",
  building: "#b29986",
  structure: "#4d5566",
  parking: "#9ca3af",
  selected: "#e85e00", // --primary
} as const;

export const componentColor: Record<ComponentType, string> = {
  road: mapColors.pavement,
  park: mapColors.park,
  building: mapColors.building,
  structure: mapColors.structure,
  parking: mapColors.parking,
  custom: mapColors.structure,
};
