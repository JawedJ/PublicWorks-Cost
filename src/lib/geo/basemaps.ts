// Basemap styles. MapTiler when a key is configured, OpenFreeMap otherwise.

export type BasemapId = "streets" | "satellite";

const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

export const hasMaptilerKey = maptilerKey.length > 0;

/** Satellite imagery needs MapTiler; without a key only streets is offered. */
export const availableBasemaps: BasemapId[] = hasMaptilerKey
  ? ["streets", "satellite"]
  : ["streets"];

export function basemapStyleUrl(id: BasemapId): string {
  if (!hasMaptilerKey) return "https://tiles.openfreemap.org/styles/positron";
  const map = id === "satellite" ? "hybrid" : "streets-v2";
  return `https://api.maptiler.com/maps/${map}/style.json?key=${maptilerKey}`;
}

/** Default view: Kitchener–Waterloo, Ontario. */
export const defaultView = { lng: -80.4928, lat: 43.4513, zoom: 13 };
