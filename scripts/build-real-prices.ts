/**
 * Replaces sample road and park prices with real published data, in place:
 *
 * - Road and civil unit prices (src/data/unit-prices.json): Alberta Transportation
 *   Unit Price Averages (average of the three lowest bids, weighted by quantity,
 *   provincial column). Typical = latest year; low/high = the spread of the
 *   same item across 2024–2026 provincial and 2026 regional averages.
 * - Park features (src/data/park-features.json): Town of Orangeville 2024
 *   Development Charges Background Study (Watson & Associates), Tables B-13 to
 *   B-15: 2024 replacement values of real park amenities. The tables are images
 *   in the PDF, so the values are transcribed below with their page.
 *
 * Items without a public source keep their sample price (no `source` field).
 * Run: pnpm data:prices
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_PRICES = join(ROOT, "src/data/unit-prices.json");
const PARK_FEATURES = join(ROOT, "src/data/park-features.json");

const AB_URL =
  "https://www.alberta.ca/system/files/custom_downloaded_images/trans-unit-price-averages.xlsx";
const AB_PAGE = "https://www.alberta.ca/unit-prices-and-cost-adjustments";
const OV_URL =
  "https://www.orangeville.ca/en/doing-business/resources/Documents/Town%20of%20Orangeville%202024%20D.C.%20Background%20Study%20-%20Final%20Report.pdf";

type Range = { low: number; typical: number; high: number };
const r2 = (n: number) => Math.round(n * 100) / 100;

// --- Alberta Transportation unit price averages ---

type AbRow = {
  desc: string;
  unit: string;
  values: { amount: number; qty: number }[];
};

/** Per sheet: rows with the provincial column (index 0) and each region after it. */
async function readAlberta(): Promise<Map<string, AbRow[]>> {
  const res = await fetch(AB_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (PublicWorks Cost data script)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`${AB_URL}: HTTP ${res.status}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  const sheets = new Map<string, AbRow[]>();
  wb.eachSheet((ws) => {
    const year = ws.name.match(/^(\d{4}) UPA/)?.[1];
    if (!year) return;
    const rows: AbRow[] = [];
    ws.eachRow((row) => {
      const v = row.values as unknown[];
      const desc = typeof v[3] === "string" ? v[3] : "";
      const unit = typeof v[4] === "string" ? v[4] : "";
      if (!desc || !unit || v[2] === "Item") return;
      const values = [];
      // Province then regions: groups of (contracts, amount, quantity, average) from column 5.
      for (let c = 5; c + 2 < v.length; c += 4)
        values.push({
          amount: Number(v[c + 1]) || 0,
          qty: Number(v[c + 2]) || 0,
        });
      rows.push({ desc: desc.replace(/\s+/g, " ").trim(), unit, values });
    });
    sheets.set(year, rows);
  });
  return sheets;
}

/** Quantity-weighted average of the matching rows in one column (0 = province). */
function average(
  rows: AbRow[],
  match: RegExp,
  unit: string,
  col: number,
): number | null {
  let amount = 0;
  let qty = 0;
  for (const r of rows)
    if (match.test(r.desc) && r.unit === unit) {
      amount += r.values[col]?.amount ?? 0;
      qty += r.values[col]?.qty ?? 0;
    }
  return qty > 0 && amount > 0 ? amount / qty : null;
}

type AbMap = {
  id: string;
  /** One or more Alberta items; their unit prices are added (e.g. pole + base). */
  parts: { match: RegExp; unit: string }[];
  /** Converts the Alberta unit to ours (e.g. 2.2 t per m³, 1/1000 km per m). */
  factor: number;
  note: string;
};

const AB_ITEMS: AbMap[] = [
  {
    id: "excavation_common",
    parts: [{ match: /^Subgrade Excavation$/, unit: "cubic metre" }],
    factor: 1,
    note: "Subgrade Excavation",
  },
  {
    id: "fill_imported",
    parts: [
      {
        match: /^Borrow Excavation - Contractor Supplied$/,
        unit: "cubic metre",
      },
    ],
    factor: 1,
    note: "Borrow Excavation, contractor supplied",
  },
  {
    id: "grading_rough_fine",
    parts: [
      {
        match: /^Preparing Subgrade Surface \(First Layer\)$/,
        unit: "square metre",
      },
    ],
    factor: 1,
    note: "Preparing Subgrade Surface",
  },
  {
    id: "erosion_sediment_control",
    parts: [
      { match: /^Erosion Control Barrier \(Silt Fence\)$/, unit: "metre" },
    ],
    factor: 1,
    note: "Silt fence",
  },
  {
    id: "geotextile",
    parts: [
      {
        match: /^Non-Woven Geotextile - Supply and Install$/,
        unit: "square metre",
      },
    ],
    factor: 1,
    note: "Non-woven geotextile",
  },
  {
    id: "granular_a",
    parts: [
      { match: /^Granular Base Course - Des\. 2 Cl\. 25$/, unit: "tonne" },
    ],
    factor: 2.2,
    note: "Granular Base Course, $/t × 2.2 t/m³",
  },
  {
    id: "granular_b",
    parts: [{ match: /^Granular Fill$/, unit: "tonne" }],
    factor: 2.1,
    note: "Granular Fill, $/t × 2.1 t/m³",
  },
  {
    id: "asphalt_hl3",
    parts: [
      { match: /^Asphalt Concrete Pavement - EPS Mix Type M1$/, unit: "tonne" },
    ],
    factor: 1,
    note: "Asphalt Concrete Pavement, mix M1",
  },
  {
    id: "asphalt_hl8",
    parts: [
      {
        match: /^Asphalt Concrete Pavement - EPS Mix Type (H1|H2|M1|L1)$/,
        unit: "tonne",
      },
    ],
    factor: 1,
    note: "Asphalt Concrete Pavement, mixes H1/H2/M1/L1",
  },
  {
    id: "asphalt_milling",
    parts: [{ match: /^Cold Milling Asphalt Pavement$/, unit: "square metre" }],
    factor: 1,
    note: "Cold Milling Asphalt Pavement",
  },
  {
    id: "pavement_removal",
    parts: [
      {
        match: /^Asphalt Surfacing - Remove and Dispose$/,
        unit: "cubic metre",
      },
    ],
    factor: 0.1,
    note: "Asphalt Surfacing Remove and Dispose, $/m³ × 0.1 m",
  },
  {
    id: "pavement_markings",
    parts: [
      {
        match:
          /^Roadway Lines - Supplying Paint and Painting \(Lane Dividing Lines\)$/,
        unit: "kilometre",
      },
    ],
    factor: 0.001,
    note: "Lane dividing lines, $/km ÷ 1000",
  },
  {
    id: "curb_gutter",
    parts: [{ match: /^Curb and Gutter$/, unit: "metre" }],
    factor: 1,
    note: "Curb and Gutter",
  },
  {
    id: "curb_barrier",
    parts: [{ match: /^Concrete Curb$/, unit: "metre" }],
    factor: 1,
    note: "Concrete Curb",
  },
  {
    id: "sidewalk_removal",
    parts: [
      {
        match: /^Concrete Surface - Remove and Dispose$/,
        unit: "square metre",
      },
    ],
    factor: 1,
    note: "Concrete Surface Remove and Dispose",
  },
  {
    id: "sidewalk_concrete",
    parts: [{ match: /^Median Concrete Surfacing$/, unit: "square metre" }],
    factor: 1,
    note: "Median Concrete Surfacing (flatwork proxy)",
  },
  {
    id: "storm_450",
    parts: [
      {
        match: /^Culverts - Supply and Install \(450 mm dia\. R\.C\.P\.\)$/,
        unit: "metre",
      },
    ],
    factor: 1,
    note: "450 mm concrete pipe (culvert install)",
  },
  {
    id: "storm_600",
    parts: [
      {
        match: /^Culverts - Supply and Install \(600 mm dia\. R\.C\.P\.\)$/,
        unit: "metre",
      },
    ],
    factor: 1,
    note: "600 mm concrete pipe (culvert install)",
  },
  {
    id: "storm_900",
    parts: [
      {
        match: /^Culverts - Supply and Install \(900 mm dia\. R\.C\.P\.\)$/,
        unit: "metre",
      },
    ],
    factor: 1,
    note: "900 mm concrete pipe (culvert install)",
  },
  {
    id: "catch_basin",
    parts: [{ match: /^Catch Basin - Supply and Install/, unit: "unit" }],
    factor: 1,
    note: "Catch Basin, 600 mm × 1.83 m",
  },
  {
    id: "streetlight_pole",
    parts: [
      { match: /^Street Light Standard - Supply and Install$/, unit: "unit" },
      {
        match: /^Pre-Cast Concrete Street Light Base - Supply and Install$/,
        unit: "unit",
      },
    ],
    factor: 1,
    note: "Street Light Standard + precast base",
  },
  {
    id: "streetlight_cable",
    parts: [
      { match: /^Secondary Cable - Supply and Install$/, unit: "metre" },
      { match: /^Trenching and Backfilling$/, unit: "metre" },
    ],
    factor: 1,
    note: "Secondary Cable + Trenching and Backfilling",
  },
  {
    id: "topsoil_150",
    parts: [{ match: /^Topsoil Placement$/, unit: "square metre" }],
    factor: 1,
    note: "Topsoil Placement",
  },
  {
    id: "hydroseed",
    parts: [{ match: /^Hydro-Seeding$/, unit: "hectare" }],
    factor: 0.0001,
    note: "Hydro-Seeding, $/ha ÷ 10,000",
  },
  {
    id: "rip_rap",
    parts: [{ match: /^Heavy Rock Riprap \(Class 1\)$/, unit: "cubic metre" }],
    factor: 1,
    note: "Heavy Rock Riprap, Class 1",
  },
  {
    id: "guide_rail_steel",
    parts: [
      {
        match: /^Strong Post W-Beam Guardrail - Supply and Install$/,
        unit: "metre",
      },
    ],
    factor: 1,
    note: "Strong Post W-Beam Guardrail",
  },
];

/** Typical from the latest year; low/high from the spread across years and regions. */
function band(typical: number, others: number[]): Range {
  const all = [typical, ...others];
  const low = Math.max(Math.min(...all), typical * 0.6);
  const high = Math.min(Math.max(...all), typical * 1.8);
  return {
    low: r2(Math.min(low, typical * 0.9)),
    typical: r2(typical),
    high: r2(Math.max(high, typical * 1.1)),
  };
}

// --- Orangeville 2024 D.C. study: park amenity values (transcribed) ---

const OV = (page: string, what: string) => ({
  en: `Town of Orangeville 2024 D.C. Background Study (Watson & Associates), ${page}: ${what}`,
  fr: `Étude préliminaire des redevances d'aménagement 2024 de la Ville d'Orangeville (Watson & Associates), ${page} : ${what}`,
});

/** feature → tier → price; values in 2024 $. Conversions to m² state their assumption. */
const PARK: Record<
  string,
  { tiers: Record<string, Range>; source: { en: string; fr: string } }
> = {
  playground: {
    // 17 playgrounds $30k–$80k (median $50k), plus engineered wood fibre surfacing $8k–$20k (median $15k).
    tiers: {
      small: { low: 38000, typical: 45000, high: 55000 },
      medium: { low: 55000, typical: 65000, high: 80000 },
      large: { low: 80000, typical: 95000, high: 100000 },
    },
    source: OV(
      "Table B-14",
      "17 playgrounds $30k–$80k plus wood fibre surfacing $8k–$20k",
    ),
  },
  splash_pad: {
    // One splash pad, $300k. Small/large scaled from it.
    tiers: {
      small: { low: 150000, typical: 185000, high: 240000 },
      medium: { low: 240000, typical: 300000, high: 380000 },
      large: { low: 380000, typical: 465000, high: 600000 },
    },
    source: OV(
      "Table B-14",
      "splash pad $300,000 (one data point; small and large scaled from it)",
    ),
  },
  sports_field: {
    // Soccer field $100k–$150k unlit, $350k irrigated; ≈ 7,700 m² with run-offs.
    tiers: {
      natural: { low: 13, typical: 19.5, high: 45.5 },
      artificial_turf: { low: 162, typical: 190, high: 247 },
    },
    source: OV(
      "Table B-14",
      "soccer fields $100k–$150k, irrigated $350k, per ≈7,700 m² field (artificial turf still sample)",
    ),
  },
  sports_field_lighting: {
    // Soccer field lights/poles $200k–$225k per field ≈ 7,700 m².
    tiers: { default: { low: 23, typical: 27.5, high: 33 } },
    source: OV(
      "Table B-14",
      "sports field lighting $200k–$225k per ≈7,700 m² field",
    ),
  },
  trail: {
    // $/linear metre ÷ 3 m typical width: limestone $62, asphalt $260, boardwalk $350.
    tiers: {
      granular: { low: 17, typical: 20.7, high: 26 },
      asphalt: { low: 72, typical: 86.7, high: 100 },
      boardwalk: { low: 100, typical: 116.7, high: 200 },
    },
    source: OV(
      "Table B-15",
      "trails $62 (limestone), $260 (asphalt), $350 (boardwalk) per metre, ÷ 3 m width",
    ),
  },
  washroom: {
    // Washroom building $277k; pavilion with washrooms $500k; ≈ 40 m² building.
    tiers: { default: { low: 5500, typical: 6925, high: 12500 } },
    source: OV(
      "Table B-14",
      "washroom building $277,000 (and $500,000 with pavilion), per ≈40 m²",
    ),
  },
  shade_structure: {
    // Gazebos $10k–$100k (median $20k); pavilions $50k–$60k.
    tiers: {
      small: { low: 10000, typical: 20000, high: 50000 },
      large: { low: 50000, typical: 60000, high: 100000 },
    },
    source: OV("Table B-14", "gazebos $10k–$100k, pavilions $50k–$60k"),
  },
  seating_area: {
    // Spectator seating $15k–$25k.
    tiers: { default: { low: 15000, typical: 20000, high: 25000 } },
    source: OV("Table B-14", "spectator seating $15k–$25k"),
  },
  skate_park: {
    // Skateboard park $600k; BMX park $225k; ≈ 1,000 m².
    tiers: { default: { low: 225, typical: 600, high: 750 } },
    source: OV(
      "Table B-14",
      "skateboard park $600,000 (BMX park $225,000), per ≈1,000 m²",
    ),
  },
  sports_court: {
    // Tennis court $180k (≈670 m²); multi-use court $15k–$75k (≈210–420 m²).
    tiers: { default: { low: 71, typical: 180, high: 270 } },
    source: OV(
      "Table B-14",
      "tennis court $180,000 per ≈670 m², multi-use courts $15k–$75k",
    ),
  },
  dog_park: {
    // Parkland development $400k/ha + off-leash fencing $30k for 0.6 ha.
    tiers: { default: { low: 40, typical: 45, high: 55 } },
    source: OV(
      "Tables B-13, B-14",
      "parkland development $400,000/ha plus dog park fencing $30,000 per 0.6 ha",
    ),
  },
};

async function main() {
  const ab = await readAlberta();
  // Last three years: recent enough to reflect current prices.
  const years = [...ab.keys()].sort().slice(-3);
  const latest = years.at(-1)!;
  const rows = ab.get(latest)!;
  console.log(
    `Alberta UPA sheets: ${years.join(", ")} (typical from ${latest})`,
  );

  const up = JSON.parse(await readFile(UNIT_PRICES, "utf8"));
  let replaced = 0;
  for (const m of AB_ITEMS) {
    const item = up.items.find((i: { id: string }) => i.id === m.id);
    if (!item) throw new Error(`No unit price ${m.id}`);
    const sum = (sheet: AbRow[], col: number) => {
      const parts = m.parts.map((p) => average(sheet, p.match, p.unit, col));
      return parts.every((v) => v !== null)
        ? (parts as number[]).reduce((a, b) => a + b, 0) * m.factor
        : null;
    };
    const typical = sum(rows, 0);
    if (typical === null) {
      console.warn(`  ${m.id}: not found in ${latest}, kept sample`);
      continue;
    }
    const others: number[] = [];
    for (const y of years)
      if (y !== latest) others.push(sum(ab.get(y)!, 0) ?? NaN);
    for (let col = 1; col < 6; col++) others.push(sum(rows, col) ?? NaN);
    item.price = band(typical, others.filter(Number.isFinite));
    item.source = {
      en: `Alberta Transportation Unit Price Averages ${latest} (3 low bids): ${m.note}`,
      fr: `Moyennes des prix unitaires de Transports Alberta ${latest} (3 plus basses soumissions) : ${m.note}`,
    };
    replaced++;
    console.log(
      `  ${m.id}: ${item.price.low} / ${item.price.typical} / ${item.price.high} ${item.unit}`,
    );
  }
  up.meta.notes = `Mixed: ${replaced} road and civil items are real, from Alberta Transportation Unit Price Averages (${AB_PAGE}; average of the 3 lowest bids weighted by quantity, provincial; low/high = spread across ${years[0]}–${latest} and regions; Alberta highway contracts used as a proxy for Ontario municipal work). Items with a 'source' are real; the rest (watermains, sanitary sewers, services, traffic signals, allowances) are still illustrative sample prices. CAD, excluding GST/HST. Generated by scripts/build-real-prices.ts.`;
  await writeFile(UNIT_PRICES, JSON.stringify(up, null, 2) + "\n");

  const pf = JSON.parse(await readFile(PARK_FEATURES, "utf8"));
  for (const [kind, v] of Object.entries(PARK)) {
    if (!pf.features[kind]) throw new Error(`No park feature ${kind}`);
    pf.features[kind].tiers = v.tiers;
    pf.features[kind].source = v.source;
  }
  pf.meta.notes = `Mixed: ${Object.keys(PARK).length} features are real 2024 replacement values from the Town of Orangeville 2024 Development Charges Background Study, Watson & Associates, Tables B-13 to B-15 (${OV_URL}), converted to our units where stated in each source. Features without a 'source' (trail lighting, parking, tree planting, plaza, community garden, outdoor rink) are still illustrative sample prices. Generated by scripts/build-real-prices.ts.`;
  await writeFile(PARK_FEATURES, JSON.stringify(pf, null, 2) + "\n");
  console.log(
    `Updated ${replaced} unit prices and ${Object.keys(PARK).length} park features`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
