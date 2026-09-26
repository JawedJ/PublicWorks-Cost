import { z } from "zod";

// Place search, as you type. MapTiler geocoding when a key is configured;
// otherwise Photon (komoot's OpenStreetMap geocoder, which allows
// search-as-you-type, unlike Nominatim). Results are limited to Canada.

export type GeocodeResult = {
  id: string;
  label: string;
  center: [number, number];
  /** [west, south, east, north] */
  bbox?: [number, number, number, number];
};

const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const maptilerSchema = z.object({
  features: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      place_name: z.string(),
      center: z.tuple([z.number(), z.number()]),
      bbox: bboxSchema.optional(),
    }),
  ),
});

const photonSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({
        osm_type: z.string(),
        osm_id: z.number(),
        name: z.string().optional(),
        housenumber: z.string().optional(),
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        countrycode: z.string().optional(),
        // [west, north, east, south]
        extent: bboxSchema.optional(),
      }),
    }),
  ),
});

export function parseMaptiler(json: unknown): GeocodeResult[] {
  return maptilerSchema.parse(json).features.map((f) => ({
    id: String(f.id),
    label: f.place_name,
    center: f.center,
    bbox: f.bbox,
  }));
}

/** Canada's bounding box, [west, south, east, north]. */
const CANADA_BBOX = "-141.1,41.6,-52.5,83.2";

export function parsePhoton(json: unknown): GeocodeResult[] {
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];
  for (const f of photonSchema.parse(json).features) {
    const p = f.properties;
    if (p.countrycode && p.countrycode !== "CA") continue;
    const address = [p.housenumber, p.street].filter(Boolean).join(" ");
    const parts = [p.name, address, p.city, p.state].filter(
      (x, i, all): x is string => Boolean(x) && all.indexOf(x) === i,
    );
    const label = parts.join(", ");
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const e = p.extent;
    out.push({
      id: `${p.osm_type}${p.osm_id}`,
      label,
      center: f.geometry.coordinates,
      bbox: e ? [e[0], e[3], e[2], e[1]] : undefined,
    });
  }
  return out;
}

const TIMEOUT_MS = 6000;

export async function geocode(
  query: string,
  opts: { language: string; maptilerKey?: string; signal?: AbortSignal },
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const signal = AbortSignal.any([
    AbortSignal.timeout(TIMEOUT_MS),
    ...(opts.signal ? [opts.signal] : []),
  ]);

  if (opts.maptilerKey) {
    const url = new URL(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`,
    );
    url.search = new URLSearchParams({
      key: opts.maptilerKey,
      country: "ca",
      language: opts.language,
      limit: "5",
      autocomplete: "true",
    }).toString();
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    return parseMaptiler(await res.json());
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({
    q,
    // Photon supports en/fr/de; ask for extra results since non-Canadian ones are dropped.
    lang: opts.language === "fr" ? "fr" : "en",
    limit: "8",
    bbox: CANADA_BBOX,
  }).toString();
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  return parsePhoton(await res.json()).slice(0, 5);
}
