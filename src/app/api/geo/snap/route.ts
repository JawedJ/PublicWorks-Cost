import { z } from "zod";
import { ApiError, jsonRoute, rateLimiters } from "@/lib/api";
import { PositionSchema } from "@/lib/schemas";

// Snap to streets (P1.17): routes between the clicked points along the street
// network with OSRM. The client falls back to straight segments on any error.

const BodySchema = z.object({
  points: z.array(PositionSchema).min(2).max(25),
});

const OSRM_URL = `${process.env.OSRM_URL || "https://router.project-osrm.org"}/route/v1/driving`;
const TIMEOUT_MS = 6000;
const cache = new Map<string, [number, number][]>();

export const POST = jsonRoute(
  { name: "geo/snap", body: BodySchema, rateLimit: rateLimiters.geo },
  async ({ body }) => {
    const coords = body.points
      .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
      .join(";");
    const hit = cache.get(coords);
    if (hit) return { coordinates: hit, source: "cache" };
    let res: Response;
    try {
      res = await fetch(
        `${OSRM_URL}/${coords}?overview=full&geometries=geojson`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
    } catch {
      throw new ApiError("upstream_timeout", "Street routing timed out");
    }
    if (!res.ok) throw new ApiError("upstream_error", `OSRM ${res.status}`);
    const json = (await res.json()) as {
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const coordinates = json.routes?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2)
      throw new ApiError("upstream_error", "No route found");
    if (cache.size > 500) cache.clear();
    cache.set(coords, coordinates);
    return { coordinates, source: "osrm" };
  },
);
