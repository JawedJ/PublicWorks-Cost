/**
 * Fetches Statistics Canada Building Construction Price Indexes (table 18-10-0289-01)
 * for the Ontario CMAs and the composite, and writes src/data/public/statcan-bcpi.json.
 *
 * Run: pnpm data:bcpi   (or pnpm data:refresh for all public data)
 * Uses the StatCan Web Data Service; the app never calls it at runtime (SPEC 8.1).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCT_ID = 18100289;
const WDS = "https://www150.statcan.gc.ca/t1/wds/rest";
/** 6 years of quarters: covers the seed price year and the trailing 8-quarter trend. */
const LATEST_N = 24;
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/public/statcan-bcpi.json",
);

// Member ids from getCubeMetadata. Keys are what the app uses (regional-factors.json `referenceCma`).
const GEOGRAPHIES = { composite: 1, ottawa: 12, toronto: 13, london: 14 };
const BUILDING_TYPES = {
  residential: 1,
  apartment: 2,
  high_rise_apartment: 3,
  low_rise_apartment: 4,
  single_detached: 5,
  townhouse: 6,
  non_residential: 7,
  commercial: 8,
  office: 9,
  bus_depot: 14,
  institutional: 15,
  school: 16,
};
// Composite plus the divisions useful as labelled proxies for civil work.
const DIVISIONS = {
  composite: 1,
  concrete: 4,
  structural_steel: 6,
  earthwork: 22,
  exterior_improvements: 23,
  utilities: 24,
};

type Member = { memberId: number; memberNameEn: string; memberNameFr: string };
type CubeMetadata = {
  cubeTitleEn: string;
  cubeTitleFr: string;
  releaseTime: string;
  dimension: { member: Member[] }[];
};
type DataPoint = { refPer: string; value: number | null };
type SeriesResponse = {
  status: string;
  object: { coordinate: string; vectorDataPoint: DataPoint[] };
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WDS}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function names(members: Member[], ids: Record<string, number>) {
  return Object.entries(ids).map(([key, id]) => {
    const m = members.find((x) => x.memberId === id);
    if (!m) throw new Error(`Member ${id} (${key}) not found; table changed?`);
    return { key, name: { en: m.memberNameEn, fr: m.memberNameFr } };
  });
}

/** "2026-04-01" → "2026Q2" */
function quarter(refPer: string): string {
  const [y, m] = refPer.split("-").map(Number);
  return `${y}Q${Math.floor((m! - 1) / 3) + 1}`;
}

async function main() {
  const [meta] = await post<{ status: string; object: CubeMetadata }[]>(
    "getCubeMetadata",
    [{ productId: PRODUCT_ID }],
  );
  if (meta?.status !== "SUCCESS") throw new Error("getCubeMetadata failed");
  const [geoDim, typeDim, divDim] = meta.object.dimension;

  const wanted: {
    geo: string;
    type: string;
    division: string;
    coordinate: string;
  }[] = [];
  for (const [geo, g] of Object.entries(GEOGRAPHIES))
    for (const [type, t] of Object.entries(BUILDING_TYPES))
      for (const [division, d] of Object.entries(DIVISIONS))
        wanted.push({
          geo,
          type,
          division,
          coordinate: `${g}.${t}.${d}.0.0.0.0.0.0.0`,
        });

  const series = [];
  for (let i = 0; i < wanted.length; i += 100) {
    const batch = wanted.slice(i, i + 100);
    const results = await post<SeriesResponse[]>(
      "getDataFromCubePidCoordAndLatestNPeriods",
      batch.map((w) => ({
        productId: PRODUCT_ID,
        coordinate: w.coordinate,
        latestN: LATEST_N,
      })),
    );
    for (const [j, r] of results.entries()) {
      // Not every type × division × CMA combination is published.
      if (r.status !== "SUCCESS") continue;
      const points = r.object.vectorDataPoint
        .filter((p) => typeof p.value === "number")
        .map((p) => [quarter(p.refPer), p.value] as [string, number]);
      if (points.length === 0) continue;
      const { geo, type, division } = batch[j]!;
      series.push({ geo, type, division, points });
    }
  }

  const out = {
    source: {
      title: { en: meta.object.cubeTitleEn, fr: meta.object.cubeTitleFr },
      publisher: "Statistics Canada",
      tableId: "18-10-0289-01",
      url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810028901",
      licence: "Statistics Canada Open Licence",
      licenceUrl: "https://www.statcan.gc.ca/en/reference/licence",
      base: "2023=100",
      releaseTime: meta.object.releaseTime,
      retrievedAt: new Date().toISOString(),
    },
    geographies: names(geoDim!.member, GEOGRAPHIES),
    buildingTypes: names(typeDim!.member, BUILDING_TYPES),
    divisions: names(divDim!.member, DIVISIONS),
    series,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${series.length} of ${wanted.length} series to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
