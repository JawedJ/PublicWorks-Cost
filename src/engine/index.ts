import type {
  Component,
  ComponentType,
  Estimate,
  EstimateClass,
  Flag,
  ImprovementHint,
  LineItem,
  LineItemCategory,
  Measurements,
  PriceCategory,
  Project,
  ProjectMeasurements,
  RefData,
  Scenario,
} from "@/lib/schemas";
import { bcpiEscalation, trailingAnnualRate } from "./escalation";
import { resolveParams } from "./params";
import { createRng, normal, normalCdf, percentile, triangular } from "./rng";
import { templates } from "./templates";
import { L, t } from "./text";
import type { QuantityLine } from "./types";

// computeEstimate (SPEC 7): quantities per component → priced line items →
// component direct costs → project-level mobilization, soft costs, escalation,
// taxes → one seeded Monte Carlo over everything → combined + per-component results.

export const ITERATIONS = 5000;
/** Default escalation rate in settings; when unchanged, the BCPI trailing trend is used instead. */
const DEFAULT_ESCALATION = 0.04;
const WINTER_PREMIUM = 0.08;
const WINTER_CATEGORIES: LineItemCategory[] = [
  "earthworks",
  "concrete",
  "paving",
];
const MOBILIZATION_PCT = 0.06;
/** Correlation of line items within a price category. */
const CATEGORY_CORRELATION = 0.6;
const CLASS_RANGE: Record<EstimateClass, { lowPct: number; highPct: number }> =
  {
    D: { lowPct: -30, highPct: 50 },
    C: { lowPct: -20, highPct: 30 },
    B: { lowPct: -15, highPct: 20 },
    A: { lowPct: -10, highPct: 15 },
  };
const CLASS_ORDER: EstimateClass[] = ["D", "C", "B", "A"];
/** Soft costs as fractions of component direct cost (SPEC 7.5). */
const SOFT: Record<
  ComponentType,
  {
    engineering: number;
    contractAdmin: number;
    permitsApprovals: number;
    projectManagement: number;
    ffe?: number;
  }
> = {
  road: {
    engineering: 0.1,
    contractAdmin: 0.05,
    permitsApprovals: 0.01,
    projectManagement: 0.03,
  },
  park: {
    engineering: 0.1,
    contractAdmin: 0.04,
    permitsApprovals: 0.01,
    projectManagement: 0.03,
  },
  building: {
    engineering: 0.1,
    contractAdmin: 0.04,
    permitsApprovals: 0.015,
    projectManagement: 0.03,
    ffe: 0.08,
  },
  structure: {
    engineering: 0.12,
    contractAdmin: 0.05,
    permitsApprovals: 0.02,
    projectManagement: 0.03,
  },
  custom: {
    engineering: 0.1,
    contractAdmin: 0.04,
    permitsApprovals: 0.01,
    projectManagement: 0.03,
  },
};
const PRICE_CATEGORIES: PriceCategory[] = [
  "asphalt",
  "concrete",
  "steel",
  "pipe",
  "lumber",
  "labour",
  "general",
];

export type EstimateOptions = { seed: number; now?: Date; iterations?: number };

/** Components in the active scenario, with its param overrides applied. */
export function activeComponents(project: Project): {
  components: Component[];
  scenario: Scenario;
} {
  const scenario =
    project.scenarios.find((s) => s.id === project.activeScenarioId) ??
    project.scenarios[0]!;
  const removed = new Set(scenario.removedComponentIds);
  const components = [...project.components, ...scenario.addedComponents]
    .filter((c) => !removed.has(c.id))
    .map((c) => {
      const o = scenario.componentOverrides[c.id];
      if (!o) return c;
      return {
        ...c,
        params: { ...c.params, ...o.params },
        geometry: o.geometry ?? c.geometry,
        startOffsetMonths: o.startOffsetMonths ?? c.startOffsetMonths,
      };
    });
  return { components, scenario };
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth());

/** True if the window [start, start + months) includes any of December–March. */
function overlapsWinter(start: Date, months: number): boolean {
  for (let i = 0; i < Math.min(months, 12); i++) {
    const m = (start.getUTCMonth() + i) % 12;
    if (m === 11 || m <= 2) return true;
  }
  return false;
}

/** Input completeness → class (SPEC 7.3). */
function componentClass(
  c: Component,
  hasDocuments: boolean,
): { cls: EstimateClass; hints: ImprovementHint[] } {
  if (c.type === "custom") return { cls: "D", hints: [] };
  const important = templates[c.type].paramCatalog.filter(
    (d) => d.costImpact >= 3,
  );
  const total = important.reduce((s, d) => s + d.costImpact, 0) || 1;
  const answered = important.filter(
    (d) => c.paramMeta[d.id] && c.paramMeta[d.id]!.source !== "default",
  );
  const score =
    answered.reduce((s, d) => s + d.costImpact, 0) / total +
    (hasDocuments ? 0.1 : 0);
  const cls: EstimateClass =
    score < 0.25 ? "D" : score < 0.5 ? "C" : score < 0.8 ? "B" : "A";
  const hints = important
    .filter((d) => !answered.includes(d))
    .sort((a, b) => b.costImpact - a.costImpact)
    .slice(0, 3)
    .map((d) => ({ componentId: c.id, paramId: d.id, label: d.label }));
  return { cls, hints };
}

function overrunEntry(ref: RefData, c: Component, cls: EstimateClass) {
  const entries = ref.overrunReference.entries;
  return (
    entries.find(
      (e) =>
        e.componentType === c.type &&
        e.subtype === c.subtype &&
        e.estimateClass === cls,
    ) ??
    entries.find(
      (e) =>
        e.componentType === c.type && !e.subtype && e.estimateClass === cls,
    )
  );
}

export function computeEstimate(
  project: Project,
  measurements: ProjectMeasurements,
  refData: RefData,
  opts: EstimateOptions,
): Estimate {
  const now = opts.now ?? new Date();
  const { components: all, scenario } = activeComponents(project);
  const drawn = all.filter((c) => c.status === "drawn");
  const settings = project.settings;
  const region = refData.regionalFactors.regions.find(
    (r) => r.key === project.region,
  );
  const regionFactor = region?.factor ?? 1;
  const cma = region?.referenceCma ?? "toronto";
  const priceYear = refData.unitPrices.meta.priceYear;
  const trend = trailingAnnualRate(refData, cma);
  const userRate = settings.escalationRate !== DEFAULT_ESCALATION;
  const annualRate = userRate
    ? settings.escalationRate
    : (trend ?? DEFAULT_ESCALATION);
  const start = new Date(scenario.startDateOverride ?? settings.startDate);
  const flags: Flag[] = [];
  const addFlag = (f: Omit<Flag, "id">) =>
    flags.push({
      ...f,
      id: `${f.code}:${f.componentIds.join(",") || "project"}`,
    });

  const lineItems: LineItem[] = [];
  type Comp = {
    c: Component;
    direct: number;
    base: number;
    soft: Record<string, number>;
    escalation: number;
    cls: EstimateClass;
    hints: ImprovementHint[];
    lines: LineItem[];
  };
  const comps: Comp[] = [];
  let bcpiDetail: ReturnType<typeof bcpiEscalation> | null = null;

  for (const c of drawn) {
    const template = templates[c.type];
    const m: Measurements = measurements.components[c.id] ?? { features: {} };
    const ctx = {
      component: c,
      measurements: m,
      params: resolveParams(template, c.subtype, c.params),
      refData,
      settings,
      siteContext: project.siteContext,
    };
    const bcpi = bcpiEscalation(refData, cma, c.type, c.subtype, priceYear);
    if (!bcpiDetail || c.type === "building") bcpiDetail = bcpi;

    const offset = c.startOffsetMonths ?? 0;
    const compStart = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1),
    );
    const winter = overlapsWinter(compStart, settings.durationMonths);
    const shockOf = (pc: PriceCategory) =>
      (pc === "general" ? 0 : (scenario.shocks[pc] ?? 0)) / 100;

    const lines = template
      .deriveQuantities(ctx)
      .map((q: QuantityLine): LineItem => {
        const pr = q.price;
        const p =
          pr.kind === "unitPrice"
            ? refData.unitPrices.items.find((i) => i.id === pr.id)!
            : null;
        const d = pr.kind === "direct" ? pr : null;
        const category = p?.category ?? d!.category;
        const priceCategory = p?.priceCategory ?? d!.priceCategory;
        const base = p?.price ?? d!.price;
        const factor =
          regionFactor *
          bcpi.factor *
          (1 + shockOf(priceCategory)) *
          (winter && WINTER_CATEGORIES.includes(category)
            ? 1 + WINTER_PREMIUM
            : 1);
        const qOverride = c.overrides.quantities[q.localId];
        const pOverride = c.overrides.unitPrices[q.localId];
        const quantity = qOverride ?? q.quantity;
        const unitPrice =
          pOverride !== undefined
            ? { low: pOverride, typical: pOverride, high: pOverride }
            : {
                low: base.low * factor,
                typical: base.typical * factor,
                high: base.high * factor,
              };
        return {
          id: `${c.id}:${q.localId}`,
          componentId: c.id,
          elementRef: q.elementRef,
          category,
          description: q.description ?? p?.description ?? d!.description,
          quantity,
          unit: q.unit,
          quantitySource:
            qOverride !== undefined
              ? L("Entered by user", "Saisi par l'utilisateur")
              : q.quantitySource,
          unitPrice,
          unitPriceSource:
            pOverride !== undefined
              ? L("Entered by user", "Saisi par l'utilisateur")
              : (d?.source ??
                L(
                  `Sample Ontario unit price, ${priceYear}, adjusted for region and date`,
                  `Prix unitaire ontarien type (échantillon), ${priceYear}, ajusté pour la région et la date`,
                )),
          priceCategory,
          total: quantity * unitPrice.typical,
          isQuantityOverridden: qOverride !== undefined,
          isPriceOverridden: pOverride !== undefined,
          lowConfidence: d?.lowConfidence ?? false,
        };
      });

    const direct = lines.reduce((s, l) => s + l.total, 0);
    const softPct = SOFT[c.type];
    const ffe =
      softPct.ffe && ctx.params.ffeIncluded === true ? softPct.ffe : 0;
    const soft = {
      engineering: direct * softPct.engineering,
      contractAdmin: direct * softPct.contractAdmin,
      permitsApprovals: direct * softPct.permitsApprovals,
      projectManagement: direct * softPct.projectManagement,
      ffe: direct * ffe,
    };
    const softTotal = Object.values(soft).reduce((s, v) => s + v, 0);
    const midpointMonths = Math.max(
      0,
      monthsBetween(now, compStart) + settings.durationMonths / 2,
    );
    const escalation =
      (direct + softTotal) * ((1 + annualRate) ** (midpointMonths / 12) - 1);
    const { cls, hints } = componentClass(c, project.documents.length > 0);

    for (const f of template.flags(ctx)) addFlag(f);
    if (winter && lines.some((l) => WINTER_CATEGORIES.includes(l.category))) {
      addFlag({
        code: "winter_work",
        severity: "info",
        title: L("Winter construction", "Construction hivernale"),
        explanation: L(
          `Work overlaps December–March: earthworks, concrete, and paving carry an ${WINTER_PREMIUM * 100}% winter premium. Paving is usually deferred to spring.`,
          `Les travaux chevauchent décembre à mars : terrassement, béton et pavage portent un supplément hivernal de ${WINTER_PREMIUM * 100} %. Le pavage est généralement reporté au printemps.`,
        ),
        costEffect: t("+", WINTER_PREMIUM * 100, "%"),
        componentIds: [c.id],
      });
    }
    lineItems.push(...lines);
    comps.push({ c, direct, base: 0, soft, escalation, cls, hints, lines });
  }

  // --- Project-level mobilization (one per project) and taxes ---
  const directCost = comps.reduce((s, x) => s + x.direct, 0);
  const mobilization = directCost * MOBILIZATION_PCT;
  if (mobilization > 0) {
    lineItems.push({
      id: "project:mobilization",
      componentId: null,
      category: "mobilization",
      description: L(
        "Mobilization and general conditions (project)",
        "Mobilisation et conditions générales (projet)",
      ),
      quantity: 1,
      unit: "lump",
      quantitySource: t(
        MOBILIZATION_PCT * 100,
        L(
          "% of direct cost, shared by all components",
          " % du coût direct, partagé par tous les composants",
        ),
      ),
      unitPrice: {
        low: mobilization,
        typical: mobilization,
        high: mobilization,
      },
      unitPriceSource: L("Engine allowance", "Provision du moteur"),
      priceCategory: "general",
      total: mobilization,
      isQuantityOverridden: false,
      isPriceOverridden: false,
      lowConfidence: false,
    });
  }
  const sumSoft = (k: keyof Comp["soft"]) =>
    comps.reduce((s, x) => s + x.soft[k]!, 0);
  const softCosts = {
    engineering: sumSoft("engineering"),
    contractAdmin: sumSoft("contractAdmin"),
    permitsApprovals: sumSoft("permitsApprovals"),
    projectManagement: sumSoft("projectManagement"),
    ffe: sumSoft("ffe"),
  };
  const escalation = comps.reduce((s, x) => s + x.escalation, 0);
  const preTax =
    directCost +
    mobilization +
    Object.values(softCosts).reduce((s, v) => s + v, 0) +
    escalation;
  const taxes = preTax * settings.taxRate;
  const baseEstimate = preTax + taxes;
  // Each component's base share: its direct + soft + escalation + share of mobilization, plus tax.
  for (const x of comps) {
    const soft = Object.values(x.soft).reduce((s, v) => s + v, 0);
    x.base =
      (x.direct * (1 + MOBILIZATION_PCT) + soft + x.escalation) *
      (1 + settings.taxRate);
  }

  // --- Monte Carlo (SPEC 7.4) ---
  const n = opts.iterations ?? ITERATIONS;
  const rng = createRng(opts.seed);
  const totals = new Float64Array(n);
  const compTotals = comps.map(() => new Float64Array(n));
  const rho = CATEGORY_CORRELATION;
  const overrun = comps.map((x) => overrunEntry(refData, x.c, x.cls));
  for (let i = 0; i < n; i++) {
    const shock: Partial<Record<PriceCategory, number>> = {};
    for (const pc of PRICE_CATEGORIES) shock[pc] = normal(rng);
    let total = 0;
    comps.forEach((x, j) => {
      let sim = 0;
      for (const l of x.lines) {
        const u = normalCdf(
          rho * shock[l.priceCategory]! +
            Math.sqrt(1 - rho * rho) * normal(rng),
        );
        sim +=
          l.quantity *
          triangular(u, l.unitPrice.low, l.unitPrice.typical, l.unitPrice.high);
      }
      const o = overrun[j];
      const overrunFactor = o ? Math.exp(o.mu + o.sigma * normal(rng)) : 1;
      const ratio = x.direct > 0 ? x.base / x.direct : 0;
      const v = sim * ratio * overrunFactor;
      compTotals[j]![i] = v;
      total += v;
    });
    totals[i] = total;
  }
  const sorted = Array.from(totals).sort((a, b) => a - b);
  const p = (q: number) => percentile(sorted, q);
  const bins = 30;
  const lo = sorted[0] ?? 0;
  const width = ((sorted.at(-1) ?? 0) - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, b) => ({
    bin: lo + b * width,
    count: 0,
  }));
  for (const v of sorted)
    histogram[Math.min(bins - 1, Math.floor((v - lo) / width))]!.count++;

  const p50 = p(0.5);
  const components = comps.map((x, j) => {
    const s = Array.from(compTotals[j]!).sort((a, b) => a - b);
    const cp50 = percentile(s, 0.5);
    return {
      componentId: x.c.id,
      name: x.c.name,
      type: x.c.type,
      directCost: x.direct,
      p10: percentile(s, 0.1),
      p50: cp50,
      p90: percentile(s, 0.9),
      estimateClass: x.cls,
      share: p50 > 0 ? Math.min(1, cp50 / p50) : 0,
      improvementHints: x.hints,
    };
  });

  // --- Project class: cost-weighted, rounded toward less certain ---
  const weighted =
    comps.reduce((s, x) => s + CLASS_ORDER.indexOf(x.cls) * x.base, 0) /
    (baseEstimate || 1);
  const estimateClass = comps.length ? CLASS_ORDER[Math.floor(weighted)]! : "D";

  // --- Overrun risk from the largest component's reference class ---
  const biggest = comps.reduce<Comp | null>(
    (a, x) => (!a || x.base > a.base ? x : a),
    null,
  );
  const ref = biggest
    ? overrunEntry(refData, biggest.c, biggest.cls)
    : undefined;

  // --- Drivers: each price category between its low and high prices ---
  const markup = directCost > 0 ? baseEstimate / directCost : 0;
  const drivers = PRICE_CATEGORIES.map((pc) => {
    const ls = lineItems.filter((l) => l.priceCategory === pc && l.componentId);
    return {
      id: `price:${pc}`,
      label: L(`${pc[0]!.toUpperCase()}${pc.slice(1)} prices`, `Prix : ${pc}`),
      impactLow:
        ls.reduce(
          (s, l) => s + (l.unitPrice.low - l.unitPrice.typical) * l.quantity,
          0,
        ) * markup,
      impactHigh:
        ls.reduce(
          (s, l) => s + (l.unitPrice.high - l.unitPrice.typical) * l.quantity,
          0,
        ) * markup,
    };
  })
    .filter((d) => d.impactHigh - d.impactLow > 0)
    .sort((a, b) => b.impactHigh - b.impactLow - (a.impactHigh - a.impactLow))
    .slice(0, 8);

  // --- Project flags ---
  const undrawn = all.filter((c) => c.status === "planned");
  if (undrawn.length > 0) {
    addFlag({
      code: "undrawn_components",
      severity: "warning",
      title: L("Components not drawn yet", "Composants pas encore dessinés"),
      explanation: t(
        undrawn.length,
        L(
          " planned component(s) are not drawn and add no cost yet.",
          " composant(s) prévu(s) ne sont pas dessinés et n'ajoutent aucun coût.",
        ),
      ),
      componentIds: undrawn.map((c) => c.id),
    });
  }

  const subtotals: Partial<Record<LineItemCategory, number>> = {};
  for (const l of lineItems)
    subtotals[l.category] = (subtotals[l.category] ?? 0) + l.total;
  const sumBase = (type: ComponentType) =>
    comps.filter((x) => x.c.type === type).reduce((s, x) => s + x.base, 0);
  const tot = measurements.totals;
  const contingency = Math.max(p(0.8) - baseEstimate, baseEstimate * 0.05);
  const bcpi =
    bcpiDetail ?? bcpiEscalation(refData, cma, "road", "", priceYear);

  return {
    components,
    undrawnComponents: undrawn.length,
    lineItems,
    subtotals,
    directCost: directCost + mobilization,
    softCosts,
    escalation,
    escalationDetail: {
      bcpiFactor: bcpi.factor,
      bcpiLabel: bcpi.label,
      isProxy: bcpi.isProxy,
      annualRate,
      annualRateSource: userRate
        ? "user"
        : trend !== null
          ? "bcpi_trailing_8q"
          : "fallback_default",
    },
    taxes,
    baseEstimate,
    estimateClass,
    classRange: CLASS_RANGE[estimateClass],
    distribution: { p10: p(0.1), p50, p80: p(0.8), p90: p(0.9), histogram },
    recommendedContingency: {
      amount: contingency,
      pct: baseEstimate > 0 ? (contingency / baseEstimate) * 100 : 0,
    },
    overrunRisk: {
      probabilityOfOverrun:
        n > 0 ? sorted.filter((v) => v > baseEstimate).length / n : 0,
      typicalOverrunPct: ref
        ? (Math.exp(ref.mu + ref.sigma ** 2 / 2) - 1) * 100
        : 0,
      referenceNote:
        ref?.note ?? L("No reference class.", "Aucune catégorie de référence."),
    },
    drivers,
    flags,
    perUnitMetrics: {
      perM:
        tot.roadLengthM > 0 && sumBase("road") > 0
          ? sumBase("road") / tot.roadLengthM
          : undefined,
      perM2:
        tot.parkAreaM2 > 0 && sumBase("park") > 0
          ? sumBase("park") / tot.parkAreaM2
          : undefined,
      perM2GFA:
        tot.buildingGfaM2 > 0 && sumBase("building") > 0
          ? sumBase("building") / tot.buildingGfaM2
          : undefined,
    },
    sampleData: refData.unitPrices.meta.sample,
    seed: opts.seed,
    computedAt: now.toISOString(),
  };
}
