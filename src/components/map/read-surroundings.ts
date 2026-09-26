import type { Map as MapLibreMap } from "maplibre-gl";
import type { Position } from "@/lib/schemas";
import type { StreetKind, Surroundings } from "@/lib/geo/site-layout";

// Reads streets, buildings and water around the map centre from the basemap's
// vector tiles (OpenMapTiles schema: OpenFreeMap and MapTiler both use it), for the
// map-aware starting layout. No network calls: only tiles already loaded.

const STREET_KIND: Record<string, StreetKind> = {
  motorway: "highway",
  trunk: "highway",
  primary: "arterial",
  secondary: "arterial",
  tertiary: "collector",
  minor: "local",
};

/** Zoning families that count as open space (parks and open land, not protected areas). */
const OPEN_SPACE = new Set(["Open Space"]);

/**
 * Land zoned open space around `centre` (Waterloo's zoning snapshot via
 * /api/zoning/map), preferred by the layout. Empty elsewhere or on failure.
 */
async function openSpaceZones(centre: Position): Promise<Position[][]> {
  const bbox = [
    centre[0] - 0.015,
    centre[1] - 0.011,
    centre[0] + 0.015,
    centre[1] + 0.011,
  ];
  try {
    const res = await fetch("/api/zoning/map", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bbox }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const fc = (await res.json()) as GeoJSON.FeatureCollection;
    return fc.features
      .filter((f) => OPEN_SPACE.has(String(f.properties?.family ?? "")))
      .flatMap((f) =>
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates[0] as Position[]]
          : f.geometry.type === "MultiPolygon"
            ? f.geometry.coordinates.map((p) => p[0] as Position[])
            : [],
      );
  } catch {
    return [];
  }
}

/** Makes sure detailed tiles around `centre` are loaded (zoom 15), then reads them. */
export async function readSurroundings(
  map: MapLibreMap,
  centre: Position,
): Promise<Surroundings | undefined> {
  const source = map
    .getStyle()
    .layers.find(
      (l) => "source-layer" in l && l["source-layer"] === "transportation",
    );
  const sourceId = source && "source" in source ? source.source : undefined;
  if (typeof sourceId !== "string") return undefined;

  const [lng, lat] = map.getCenter().toArray();
  const moved = Math.hypot(lng - centre[0], lat - centre[1]) > 0.002;
  const wait = () =>
    new Promise<void>((done) => {
      const timer = setTimeout(done, 5000);
      map.once("idle", () => {
        clearTimeout(timer);
        done();
      });
    });
  if (map.getZoom() < 15 || moved) {
    // Buildings are only in the detailed tiles: go there and wait for them to load
    // (checking areTilesLoaded() right after the jump sees the old tiles).
    const loaded = wait();
    map.jumpTo({
      center: [centre[0], centre[1]],
      zoom: Math.max(map.getZoom(), 15),
    });
    await loaded;
  } else if (!map.areTilesLoaded()) await wait();

  const read = (sourceLayer: string) =>
    map.querySourceFeatures(sourceId, { sourceLayer });
  const lines = (g: GeoJSON.Geometry): Position[][] =>
    g.type === "LineString"
      ? [g.coordinates as Position[]]
      : g.type === "MultiLineString"
        ? (g.coordinates as Position[][])
        : [];
  const rings = (g: GeoJSON.Geometry): Position[][] =>
    g.type === "Polygon"
      ? [g.coordinates[0] as Position[]]
      : g.type === "MultiPolygon"
        ? g.coordinates.map((p) => p[0] as Position[])
        : [];

  const out: Surroundings = {
    streets: [],
    blocked: [],
    waterways: [],
    keepClear: [],
    parks: [],
    preferred: await openSpaceZones(centre),
  };
  for (const f of read("transportation")) {
    const cls = String(f.properties.class ?? "");
    if (f.properties.brunnel === "tunnel") continue;
    const kind = STREET_KIND[cls];
    if (kind)
      for (const line of lines(f.geometry)) out.streets.push({ line, kind });
    else if (cls === "rail" || cls === "transit")
      out.keepClear.push(...lines(f.geometry));
  }
  for (const f of read("building")) out.blocked.push(...rings(f.geometry));
  for (const f of read("water")) out.blocked.push(...rings(f.geometry));
  for (const f of read("waterway")) out.waterways.push(...lines(f.geometry));
  // Existing parks (never built over): the park layer, and park/garden landcover.
  for (const f of read("park")) out.parks!.push(...rings(f.geometry));
  for (const f of read("landcover"))
    if (
      /^(park|garden|playground|pitch|golf_course)$/.test(
        String(f.properties.subclass ?? ""),
      )
    )
      out.parks!.push(...rings(f.geometry));
  return out;
}
