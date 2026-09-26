/**
 * Downloads CanadaBuys award notices (current and previous fiscal year), keeps
 * construction-related awards delivered in Ontario, and writes
 * src/data/public/canadabuys-awards.json.
 *
 * Run: pnpm data:canadabuys   (or pnpm data:refresh for all public data)
 * Column names follow the CanadaBuys data dictionary:
 * https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/achatscanada-canadabuys-dd.xml
 * Records are market evidence only; they never feed the cost engine (SPEC 8.1).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/public/canadabuys-awards.json",
);
const DATASET_URL =
  "https://open.canada.ca/data/en/dataset/a1acb126-9ce8-40a9-b889-5da2b1dd20cb";

/** Government of Canada fiscal years start April 1. Returns e.g. ["2026-2027", "2025-2026"]. */
function fiscalYears(now = new Date()): string[] {
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [start, start - 1].map((y) => `${y}-${y + 1}`);
}

const fileUrl = (fy: string) =>
  `https://canadabuys.canada.ca/opendata/pub/${fy}-awardNotice-avisAttribution.csv`;

const COL = {
  titleEn: "title-titre-eng",
  titleFr: "title-titre-fra",
  reference: "referenceNumber-numeroReference",
  amendment: "amendmentNumber-numeroModification",
  solicitation: "solicitationNumber-numeroSollicitation",
  awardDate: "contractAwardDate-dateAttributionContrat",
  amount: "contractAmount-montantContrat",
  totalValue: "totalContractValue-valeurTotaleContrat",
  currency: "contractCurrency-contratMonnaie",
  category: "procurementCategory-categorieApprovisionnement",
  gsinDescription: "gsinDescription-nibsDescription-eng",
  unspscDescription: "unspscDescription-eng",
  regions: "regionsOfDelivery-regionsLivraison-eng",
  supplier: "supplierLegalName-nomLegalFournisseur-eng",
  buyer: "contractingEntityName-nomEntitContractante-eng",
} as const;

/**
 * Keywords that tag an award with the component types it's comparable to.
 * Matched against the English title and GSIN/UNSPSC descriptions (the free-text
 * description mentions roads, parking, etc. too often to be a useful signal).
 */
const TAGS: Record<string, RegExp> = {
  road: /\b(paving|repaving|asphalt|road(way)?s?|streets?|sidewalks?|curbs?|parking lots?|highways?|pavement)\b/i,
  utilities:
    /\b(watermains?|water main|sewers?|sanitary|storm ?water|culverts?|pipes?|drainage|lift station|pumping station)\b/i,
  park: /\b(parks?|playground|landscap\w*|trails?|splash pad|sports field|green ?space)\b/i,
  building:
    /\b(building|roof(ing)?|renovat\w*|construct\w* of (a|the|new)|fit-?up|hvac|envelope|facility|station|centre|center|library|school|armou?ry|detachment)\b/i,
  structure:
    /\b(bridges?|culverts?|retaining wall|dock|wharf|seawall|pumping station)\b/i,
};

/** Delivery in Ontario: an Ontario region or Ottawa, or the NCR unless it names the Quebec side. */
function inOntario(regions: string): boolean {
  if (/\b(Ontario|Ottawa)\b/i.test(regions)) return true;
  return (
    /National Capital Region/i.test(regions) &&
    !/\b(Gatineau|Quebec)\b/i.test(regions)
  );
}

/** RFC 4180 CSV parser (quoted fields may contain commas, quotes, and newlines). */
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
    // The CanadaBuys server rejects requests without a browser-like User-Agent.
    headers: { "User-Agent": "Mozilla/5.0 (PublicWorks Cost data script)" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const [header, ...rows] = parseCsv((await res.text()).replace(/^﻿/, ""));
  if (!header) return [];
  for (const col of Object.values(COL)) {
    if (!header.includes(col))
      throw new Error(
        `Missing column ${col} in ${url}; check the data dictionary`,
      );
  }
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]!])));
}

/** Decodes the HTML entities CanadaBuys leaves in text fields. */
function clean(s: string): string {
  return s
    .replace(/&(ldquo|rdquo|quot);/g, '"')
    .replace(/&(lsquo|rsquo|apos|#39);/g, "'")
    .replace(/&(ndash|mdash);/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const years = fiscalYears();
  const latest = new Map<string, Record<string, string>>();
  for (const fy of years) {
    const rows = await download(fileUrl(fy));
    console.log(`${fy}: ${rows.length} award notices`);
    for (const r of rows) {
      // Keep the latest amendment of each award.
      const key = r[COL.reference]!;
      const prev = latest.get(key);
      if (!prev || r[COL.amendment]! > prev[COL.amendment]!) latest.set(key, r);
    }
  }

  const awards = [];
  for (const r of latest.values()) {
    const text = [
      r[COL.titleEn],
      r[COL.gsinDescription],
      r[COL.unspscDescription],
    ].join(" ");
    const construction = r[COL.category]!.includes("*CNST");
    const tags = Object.entries(TAGS)
      .filter(([, re]) => re.test(text))
      .map(([tag]) => tag);
    if (!construction) continue;
    // No delivery region: skip (the buyer's address is often an Ottawa head office).
    const region = r[COL.regions]!;
    if (!inOntario(region)) continue;
    const value = Math.max(
      Number(r[COL.amount]) || 0,
      Number(r[COL.totalValue]) || 0,
    );
    if (value <= 0 || (r[COL.currency] && r[COL.currency] !== "CAD")) continue;
    const search = r[COL.solicitation] || r[COL.reference]!;
    awards.push({
      id: r[COL.reference]!,
      title: {
        en: clean(r[COL.titleEn]!),
        fr: clean(r[COL.titleFr]! || r[COL.titleEn]!),
      },
      buyer: clean(r[COL.buyer]!),
      supplier: clean(r[COL.supplier]!),
      awardDate: r[COL.awardDate] || null,
      valueCad: value,
      regions: region
        .split("\n")
        .map((s) => s.replace(/^\*/, "").trim())
        .filter(Boolean),
      tags,
      url: `https://canadabuys.canada.ca/en/tender-opportunities?search_filter=${encodeURIComponent(search)}`,
    });
  }
  awards.sort((a, b) => (b.awardDate ?? "").localeCompare(a.awardDate ?? ""));

  const out = {
    source: {
      title: "CanadaBuys award notices",
      publisher: "Public Services and Procurement Canada",
      url: DATASET_URL,
      files: years.map(fileUrl),
      licence: "Open Government Licence - Canada",
      licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
      retrievedAt: new Date().toISOString(),
      filter:
        "Procurement category Construction (CNST), delivered in Ontario (incl. Ottawa and the Ontario side of the National Capital Region), CAD, latest amendment per award. Values include taxes. Tags come from title and GSIN/UNSPSC keywords.",
      limits:
        "Federal contracts only, not municipal. Contract totals, not unit prices. Evidence only; never used in the estimate.",
    },
    awards,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${awards.length} Ontario construction awards to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
