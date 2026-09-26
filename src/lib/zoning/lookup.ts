import type { ZoneResult, ZoningRequest, ZoningResponse } from "@/lib/schemas";
import { sourceFor } from "./sources";
import { WATERLOO_BBOX, waterlooZoneAt } from "./waterloo";

// Server side of /api/zoning: one point query per building, cached by ~10 m cell.

const TIMEOUT_MS = 8_000;
const cache = new Map<string, ZoneResult>();

async function queryPoint(lng: number, lat: number): Promise<ZoneResult> {
  const [w, s, e, n] = WATERLOO_BBOX;
  if (lng >= w && lng <= e && lat >= s && lat <= n) {
    const local = waterlooZoneAt(lng, lat);
    // Outside Waterloo's zones but in its box (e.g. Kitchener): try the others.
    if (local.status === "ok") return local;
  }
  const source = sourceFor(lng, lat);
  if (!source) return { status: "no_data" };
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({
    geometry: JSON.stringify({
      x: lng,
      y: lat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    outFields: source.outFields.join(","),
    returnGeometry: "false",
    f: "json",
  });
  try {
    const res = await fetch(`${source.url}/query?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as {
      features?: { attributes: Record<string, unknown> }[];
      error?: unknown;
    };
    if (json.error) return { status: "error" };
    const zone = json.features
      ?.map((f) => source.read(f.attributes))
      .find((z) => z !== null);
    // Inside the city's box but outside its zoning map (e.g. a neighbouring town).
    const result: ZoneResult = zone
      ? { status: "ok", city: source.city, bylaw: source.bylaw, ...zone }
      : { status: "no_data" };
    if (cache.size > 2000) cache.clear();
    cache.set(key, result);
    return result;
  } catch {
    return { status: "error" };
  }
}

export async function lookupZones(req: ZoningRequest): Promise<ZoningResponse> {
  const entries = await Promise.all(
    req.points.map(
      async (p) => [p.id, await queryPoint(p.lng, p.lat)] as const,
    ),
  );
  return { zones: Object.fromEntries(entries) };
}
