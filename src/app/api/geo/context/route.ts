import { z } from "zod";
import { jsonRoute, rateLimiters } from "@/lib/api";
import type { SiteContext, SiteFeature } from "@/lib/schemas";

// Site context (P6.1): schools, hospitals, waterways, rail, major roads and existing
// buildings near the project, from OpenStreetMap via Overpass. Cached per area; on timeout or error it
// returns `source: "unavailable"` so the app keeps working.

const BodySchema = z.object({
  /** [west, south, east, north] in degrees; at most ~5 km across. */
  bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .refine(([w, s, e, n]) => e > w && n > s && e - w < 0.08 && n - s < 0.06, {
      message: "Area too large or invalid",
    }),
});

// The public Overpass server is often busy (429/504): try it twice, then a mirror.
const MAIN_URL =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const OVERPASS_URLS = [
  MAIN_URL,
  MAIN_URL,
  "https://overpass.private.coffee/api/interpreter",
];
const TIMEOUT_MS = 12_000;
const cache = new Map<string, SiteContext>();

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

function kindOf(tags: Record<string, string>): SiteFeature["kind"] | null {
  if (tags.amenity === "school") return "school";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.waterway) return "waterway";
  if (tags.railway === "rail") return "rail";
  if (tags.highway) return "road";
  if (tags.building) return "building";
  return null;
}

function pick(tags: Record<string, string>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((k) => tags[k]).map((k) => [k, tags[k]!]),
  );
}

function toFeature(el: OsmElement): SiteFeature | null {
  const tags = el.tags ?? {};
  const kind = kindOf(tags);
  if (!kind) return null;
  const line = el.geometry?.map((p) => [p.lon, p.lat] as [number, number]);
  const point =
    el.center ?? (el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : null);
  // Schools and hospitals as points (their centre); buildings as footprints;
  // linear features as lines.
  const closed =
    line &&
    line.length >= 4 &&
    line[0]![0] === line.at(-1)![0] &&
    line[0]![1] === line.at(-1)![1];
  if (kind === "building")
    return closed
      ? {
          id: `${el.type}/${el.id}`,
          kind,
          name: tags.name,
          geometry: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                line.map(
                  ([x, y]) =>
                    [Number(x.toFixed(6)), Number(y.toFixed(6))] as [
                      number,
                      number,
                    ],
                ),
              ],
            },
          },
          tags: pick(tags, ["building", "building:levels", "height"]),
        }
      : null;
  const geometry =
    (kind === "school" || kind === "hospital") && point
      ? {
          type: "Point" as const,
          coordinates: [point.lon, point.lat] as [number, number],
        }
      : line && line.length >= 2
        ? { type: "LineString" as const, coordinates: line }
        : null;
  if (!geometry) return null;
  return {
    id: `${el.type}/${el.id}`,
    kind,
    name: tags.name,
    geometry: { type: "Feature", properties: {}, geometry },
    tags: kind === "road" ? tags : undefined,
  };
}

export const POST = jsonRoute(
  { name: "geo/context", body: BodySchema, rateLimit: rateLimiters.geo },
  async ({ body }): Promise<SiteContext> => {
    const [w, s, e, n] = body.bbox.map((v) => Number(v.toFixed(4)));
    const key = [w, s, e, n].join(",");
    const hit = cache.get(key);
    if (hit) return hit;
    const b = `${s},${w},${n},${e}`;
    // Site features and roads are output separately so many local streets can't
    // crowd schools, water or rail out of the result cap.
    const query = `[out:json][timeout:11];(
      nwr["amenity"~"^(school|hospital)$"](${b});
      way["waterway"~"^(river|stream|canal)$"](${b});
      way["railway"="rail"](${b});
    )->.site;
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${b})->.roads;
    way["building"](${b})->.buildings;
    .site out tags geom 300;
    .roads out tags geom 600;
    .buildings out tags geom 5000;`;
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
            // Overpass refuses requests without an identifying User-Agent.
            "user-agent":
              "PublicWorksCost/0.1 (public infrastructure cost estimator)",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const json = (await res.json()) as { elements?: OsmElement[] };
        const features = (json.elements ?? [])
          .map(toFeature)
          .filter((f): f is SiteFeature => f !== null);
        const ctx: SiteContext = {
          source: "overpass",
          fetchedAt: new Date().toISOString(),
          features,
        };
        if (cache.size > 200) cache.clear();
        cache.set(key, ctx);
        return ctx;
      } catch (err) {
        console.warn(`[api/geo/context] ${url} unavailable`, err);
      }
    }
    return {
      source: "unavailable",
      fetchedAt: new Date().toISOString(),
      features: [],
    };
  },
);
