/**
 * Construction durations from real federal contracts. Downloads CanadaBuys
 * award notices (current and four previous fiscal years, all of Canada),
 * keeps construction contracts with a start date, end date and value, and fits
 * months = k × value^b (the classic time–cost form, Bromilow 1969) by least
 * squares on logs, separately for buildings and civil work. Writes
 * src/data/public/construction-durations.json.
 *
 * Run: pnpm data:durations   (or pnpm data:refresh for all public data)
 * The engine uses the fit to size each component's construction period (for
 * escalation to the midpoint and winter work). Award values are never used as prices.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/public/construction-durations.json",
);
const DATASET_URL =
  "https://open.canada.ca/data/en/dataset/a1acb126-9ce8-40a9-b889-5da2b1dd20cb";
const YEARS = 5;

/** Government of Canada fiscal years start April 1. */
function fiscalYears(now = new Date()): string[] {
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from(
    { length: YEARS },
    (_, i) => `${start - i}-${start - i + 1}`,
  );
}
const fileUrl = (fy: string) =>
  `https://canadabuys.canada.ca/opendata/pub/${fy}-awardNotice-avisAttribution.csv`;

const COL = {
  titleEn: "title-titre-eng",
  reference: "referenceNumber-numeroReference",
  amendment: "amendmentNumber-numeroModification",
  start: "contractStartDate-contratDateDebut",
  end: "contractEndDate-dateFinContrat",
  amount: "contractAmount-montantContrat",
  totalValue: "totalContractValue-valeurTotaleContrat",
  currency: "contractCurrency-contratMonnaie",
  category: "procurementCategory-categorieApprovisionnement",
  gsinDescription: "gsinDescription-nibsDescription-eng",
} as const;

/** Not a build: service, maintenance and framework contracts run for years regardless of size. */
const EXCLUDE =
  /maintenance|management services|standing offer|as and when|as-and-when|supply arrangement|snow|janitorial|consult|design services|inspection|survey|study|repair services|on.call|call-up|task authori/i;
const BUILDING =
  /build|facilit|detachment|office|hangar|garage|warehouse|centre|center|station|school|housing|residence|accommodat|barrack|embassy|lab|library|renovat|fit-up|fit up|roof|hvac|mechanical|electrical/i;
const CIVIL =
  /road|highway|bridge|culvert|paving|asphalt|wharf|dock|sewer|water|pipe|dam|trail|parking|runway|taxiway|apron|channel|dredg|shoreline|rail|tunnel|retaining|grading|site work|earth/i;

/** RFC 4180 CSV parser (same as fetch-canadabuys.ts). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

async function download(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (PublicWorks Cost data script)" },
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const [header, ...rows] = parseCsv((await res.text()).replace(/^﻿/, ""));
  if (!header) return [];
  for (const col of Object.values(COL))
    if (!header.includes(col))
      throw new Error(`Missing column ${col} in ${url}`);
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]!])));
}

type Point = { value: number; months: number };

/** Least squares on logs; residual percentiles give the spread. */
function fit(points: Point[]) {
  const xs = points.map((p) => Math.log(p.value));
  const ys = points.map((p) => Math.log(p.months));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  const res = xs.map((x, i) => ys[i]! - (a + b * x)).sort((p, q) => p - q);
  const q = (f: number) => Math.exp(res[Math.floor(f * (n - 1))]!);
  const round = (v: number, d = 4) => Number(v.toFixed(d));
  return {
    n,
    k: round(Math.exp(a), 5),
    b: round(b),
    p10Factor: round(q(0.1), 3),
    p90Factor: round(q(0.9), 3),
  };
}

async function main() {
  const years = fiscalYears();
  const latest = new Map<string, Record<string, string>>();
  for (const fy of years) {
    const rows = await download(fileUrl(fy));
    console.log(`${fy}: ${rows.length} award notices`);
    for (const r of rows) {
      if (!r[COL.category]!.includes("CNST")) continue;
      const key = r[COL.reference]!;
      const prev = latest.get(key);
      if (!prev || r[COL.amendment]! > prev[COL.amendment]!) latest.set(key, r);
    }
  }

  const groups: Record<"building" | "civil" | "all", Point[]> = {
    building: [],
    civil: [],
    all: [],
  };
  for (const r of latest.values()) {
    const title = r[COL.titleEn]!;
    const text = `${title} ${r[COL.gsinDescription]}`;
    if (EXCLUDE.test(text)) continue;
    if (r[COL.currency] && r[COL.currency] !== "CAD") continue;
    const start = Date.parse(r[COL.start]!.slice(0, 10));
    const end = Date.parse(r[COL.end]!.slice(0, 10));
    const value = Number(r[COL.totalValue]) || Number(r[COL.amount]) || 0;
    if (!start || !end || value < 100_000) continue;
    const months = (end - start) / (30.44 * 86_400_000);
    if (months < 0.5 || months > 120) continue;
    const p = { value, months };
    groups.all.push(p);
    if (CIVIL.test(text) && !BUILDING.test(title)) groups.civil.push(p);
    else if (BUILDING.test(text)) groups.building.push(p);
  }

  const out = {
    source: {
      title: "CanadaBuys award notices: contract start and end dates",
      publisher: "Public Services and Procurement Canada",
      url: DATASET_URL,
      files: years.map(fileUrl),
      licence: "Open Government Licence - Canada",
      licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
      retrievedAt: new Date().toISOString(),
      method:
        "Construction (CNST) awards across Canada, latest amendment, CAD, value ≥ $100,000, 0.5–120 months, excluding maintenance, service, consulting and standing-offer contracts. months = k × value^b fitted on logs (Bromilow time–cost form). Buildings and civil work split by title keywords. p10Factor/p90Factor: 10th/90th percentile of actual ÷ fitted.",
      limits:
        "Federal contracts, not municipal. Contract periods, not measured construction time (may include closeout or early start dates). Values include taxes. Wide spread: treat as a typical duration, not a schedule.",
    },
    fits: {
      building: fit(groups.building),
      civil: fit(groups.civil),
      all: fit(groups.all),
    },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${OUT}`, out.fits);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
