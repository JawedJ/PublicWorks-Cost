/**
 * Builds src/data/overrun-reference.json from published research instead of
 * sample values. The overrun factor (actual ÷ estimate) is lognormal; each
 * entry's mean and spread come from:
 *
 * - Flyvbjerg, Holm & Buhl (2002), "Underestimating Costs in Public Works
 *   Projects: Error or Lie?", JAPA 68(3), Table 1 (258 projects, constant
 *   prices, estimate at the decision to build): roads 20.4% ± 29.9 (n=167),
 *   fixed links (bridges, tunnels) 33.8% ± 62.4 (n=33), all 27.6% ± 38.7.
 * - HM Treasury (2003), Supplementary Green Book Guidance: Optimism Bias,
 *   Table 1, capital expenditure upper/lower bounds: standard buildings 24/2%,
 *   non-standard buildings 51/4%, standard civil engineering 44/3%,
 *   non-standard civil engineering 66/6%.
 *
 * Mapping to estimate classes: D (earliest) = UK upper bound; C = Flyvbjerg's
 * mean where it covers the type (estimates at the decision to build), else two
 * thirds of the way from the UK lower to upper bound; B = halfway between C and
 * A; A (most defined) = UK lower bound. Spread: Flyvbjerg's coefficient of
 * variation (SD ÷ mean) for the type, applied to each class's mean.
 *
 * Run: pnpm data:overrun
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/overrun-reference.json",
);

const FLYVBJERG = {
  roads: { mean: 20.4, sd: 29.9, n: 167 },
  fixedLinks: { mean: 33.8, sd: 62.4, n: 33 },
  all: { mean: 27.6, sd: 38.7, n: 258 },
};
const UK = {
  standardBuildings: { upper: 24, lower: 2 },
  nonStandardBuildings: { upper: 51, lower: 4 },
  standardCivil: { upper: 44, lower: 3 },
  nonStandardCivil: { upper: 66, lower: 6 },
};

type Classes = Record<"D" | "C" | "B" | "A", number>;

function classMeans(
  uk: { upper: number; lower: number },
  measuredC?: number,
): Classes {
  const C = measuredC ?? uk.lower + ((uk.upper - uk.lower) * 2) / 3;
  return { D: uk.upper, C, B: (C + uk.lower) / 2, A: uk.lower };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
function phi(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Lognormal with the given mean overrun (%) and coefficient of variation. */
function lognormal(meanPct: number, cv: number) {
  const m = 1 + meanPct / 100;
  const sd = (cv * meanPct) / 100;
  const sigma2 = Math.log(1 + (sd / m) ** 2);
  const sigma = Math.sqrt(sigma2);
  const mu = Math.log(m) - sigma2 / 2;
  return {
    probabilityOfOverrun: Number(phi(mu / sigma).toFixed(3)),
    mu: Number(mu.toFixed(4)),
    sigma: Number(sigma.toFixed(4)),
  };
}

const L = (en: string) => ({ en, fr: en });

type Group = {
  componentType: string;
  subtype?: string;
  means: Classes;
  cv: number;
  note: string;
};

const cv = (f: { mean: number; sd: number }) => f.sd / f.mean;

const GROUPS: Group[] = [
  {
    componentType: "road",
    means: classMeans(UK.standardCivil, FLYVBJERG.roads.mean),
    cv: cv(FLYVBJERG.roads),
    note: "Roads: 167 road projects averaged 20.4% over budget (SD 29.9%; Flyvbjerg et al. 2002). Early estimates: UK Treasury standard civil engineering optimism bias, 44% upper to 3% lower bound.",
  },
  {
    componentType: "park",
    means: classMeans(UK.standardCivil, FLYVBJERG.roads.mean),
    cv: cv(FLYVBJERG.roads),
    note: "Parks: no park-specific study, so the road reference class is used (civil site work; Flyvbjerg et al. 2002, 20.4% average overrun; UK Treasury standard civil engineering 44%/3%).",
  },
  {
    componentType: "structure",
    means: classMeans(UK.nonStandardCivil, FLYVBJERG.fixedLinks.mean),
    cv: cv(FLYVBJERG.fixedLinks),
    note: "Structures: 33 bridge and tunnel projects averaged 33.8% over budget (SD 62.4%; Flyvbjerg et al. 2002). Early estimates: UK Treasury non-standard civil engineering, 66% upper to 6% lower bound. Large-project data; small culverts are usually less volatile.",
  },
  {
    componentType: "building",
    means: classMeans(UK.standardBuildings),
    cv: cv(FLYVBJERG.all),
    note: "Public buildings: UK Treasury optimism bias for standard buildings, 24% (early) to 2% (well defined); spread from Flyvbjerg et al. 2002 (all 258 projects).",
  },
  ...["hospital", "performing_arts", "aquatic_centre", "museum_gallery"].map(
    (subtype): Group => ({
      componentType: "building",
      subtype,
      means: classMeans(UK.nonStandardBuildings),
      cv: cv(FLYVBJERG.all),
      note: "Complex buildings: UK Treasury optimism bias for non-standard buildings, 51% (early) to 4% (well defined); spread from Flyvbjerg et al. 2002.",
    }),
  ),
  {
    componentType: "custom",
    means: classMeans(UK.nonStandardCivil),
    cv: cv(FLYVBJERG.all),
    note: "Custom elements: no reference class, so the UK Treasury non-standard civil engineering range (66% to 6%) is used; spread from Flyvbjerg et al. 2002.",
  },
];

async function main() {
  const entries = GROUPS.flatMap((g) =>
    (["D", "C", "B", "A"] as const).map((cls) => ({
      componentType: g.componentType,
      ...(g.subtype && { subtype: g.subtype }),
      estimateClass: cls,
      ...lognormal(g.means[cls], g.cv),
      note: L(g.note),
    })),
  );
  const out = {
    meta: {
      sample: false,
      priceYear: 2025,
      notes:
        "Overrun reference classes from published research: Flyvbjerg, Holm & Buhl (2002), 'Underestimating Costs in Public Works Projects: Error or Lie?', JAPA 68(3), Table 1 (https://arxiv.org/abs/1303.6604); HM Treasury (2003) Supplementary Green Book Guidance: Optimism Bias, Table 1 (https://assets.publishing.service.gov.uk/media/5a74dae740f0b65f61322c72/Optimism_bias.pdf). Class D = UK upper bound, C = Flyvbjerg mean (or 2/3 of the UK range), B = halfway to A, A = UK lower bound; spread from Flyvbjerg's SD/mean. The overrun factor (actual / estimate) is lognormal(mu, sigma). International data (mostly Europe and North America), not Ontario-specific. Generated by scripts/build-overrun-reference.ts.",
    },
    entries,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  for (const e of entries)
    console.log(
      `${e.componentType}${"subtype" in e ? `/${e.subtype}` : ""} ${e.estimateClass}: P(over)=${e.probabilityOfOverrun} mean=${((Math.exp(e.mu + e.sigma ** 2 / 2) - 1) * 100).toFixed(1)}%`,
    );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
