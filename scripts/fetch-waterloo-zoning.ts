/**
 * Downloads every zone polygon of the City of Waterloo Zoning By-law 2018-050 and
 * writes src/data/public/waterloo-zoning.json (GeoJSON, simplified to ~2 m).
 *
 * Run: pnpm data:zoning   (or pnpm data:refresh for all public data)
 * Source: the map service behind the city's public map viewer (maps.waterloo.ca);
 * it isn't an advertised open data API, which is why we snapshot it here and the
 * app never calls it at runtime (SPEC 8.1, 8.3).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LAYER =
  "https://gis.waterloo.ca/maps/rest/services/Public/Public_Operations/MapServer/49";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/public/waterloo-zoning.json",
);
const PAGE = 500;
/** Simplification tolerance in degrees (~2 m) and coordinate decimals (~1 m). */
const SIMPLIFY_DEG = 0.00002;
const DECIMALS = 5;

type Feature = {
  type: "Feature";
  properties: Record<string, string | null>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null;
};

async function page(offset: number): Promise<Feature[]> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "ZONE_CODE,ZONE_LABEL,ZONE_LEGEND",
    outSR: "4326",
    maxAllowableOffset: String(SIMPLIFY_DEG),
    geometryPrecision: String(DECIMALS),
    orderByFields: "OBJECTID",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    f: "geojson",
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${LAYER}/query?${params}`, {
      headers: { "user-agent": "Mozilla/5.0 (PublicWorks Cost data script)" },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { features?: Feature[] };
      if (json.features) return json.features;
    }
    if (attempt >= 3)
      throw new Error(`Page at ${offset} failed (${res.status})`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const features: Feature[] = [];
for (let offset = 0; ; offset += PAGE) {
  const batch = await page(offset);
  features.push(...batch);
  console.log(`  ${features.length} zones`);
  if (batch.length < PAGE) break;
}

const clean = features
  .filter((f) => f.geometry && f.properties.ZONE_CODE)
  .map((f) => ({
    type: "Feature" as const,
    properties: {
      code: f.properties.ZONE_CODE!,
      label: f.properties.ZONE_LABEL ?? undefined,
      family: f.properties.ZONE_LEGEND ?? undefined,
    },
    geometry: f.geometry!,
  }));

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({
    source: {
      title: "City of Waterloo Zoning By-law 2018-050 (zone map)",
      publisher: "City of Waterloo",
      bylaw: "2018-050",
      url: LAYER,
      bylawUrl:
        "https://www.waterloo.ca/media/ybpnbhdm/zoning-by-law-2018-050.pdf",
      retrievedAt: new Date().toISOString(),
      limits:
        "Zone boundaries only, simplified to ~2 m. Advisory: may lag recent amendments; not a legal zoning determination.",
    },
    type: "FeatureCollection",
    features: clean,
  }) + "\n",
);
console.log(`Wrote ${clean.length} zones to ${OUT}`);
