import { z } from "zod";

// Place search. MapTiler geocoding when a key is configured (supports
// search-as-you-type); otherwise OpenStreetMap Nominatim (search on submit only,
// per its usage policy). Results are limited to Canada.

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

const nominatimSchema = z.array(
  z.object({
    place_id: z.number(),
    display_name: z.string(),
    lat: z.string(),
    lon: z.string(),
    // [south, north, west, east] as strings
    boundingbox: z
      .tuple([z.string(), z.string(), z.string(), z.string()])
      .optional(),
  }),
);

export function parseMaptiler(json: unknown): GeocodeResult[] {
  return maptilerSchema.parse(json).features.map((f) => ({
    id: String(f.id),
    label: f.place_name,
    center: f.center,
    bbox: f.bbox,
  }));
}

export function parseNominatim(json: unknown): GeocodeResult[] {
  return nominatimSchema.parse(json).map((r) => {
    const b = r.boundingbox?.map(Number);
    return {
      id: String(r.place_id),
      label: r.display_name,
      center: [Number(r.lon), Number(r.lat)],
      bbox: b ? [b[2], b[0], b[3], b[1]] : undefined,
    };
  });
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

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q,
    format: "json",
    countrycodes: "ca",
    limit: "5",
    "accept-language": opts.language,
  }).toString();
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  return parseNominatim(await res.json());
}
