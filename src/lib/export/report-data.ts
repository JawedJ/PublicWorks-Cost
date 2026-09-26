import { regionalFactors } from "@/data";
import { templates } from "@/engine/templates";
import { groupFlags } from "@/lib/estimate/group-flags";
import type {
  Component,
  Estimate,
  LineItemCategory,
  ParamDefinition,
  ParamValue,
  Project,
} from "@/lib/schemas";
import messages from "../../../messages/en.json";

// P5.2–P5.3 (SPEC 14): one plain model of the report, shared by the PDF and
// the Excel workbook. Pure; English only. The executive summary is a template
// (the AI narrative, P7.7, is a stretch goal).

const CATEGORY = messages.lineItems.categories as Record<
  LineItemCategory,
  string
>;
const SEVERITY = { high: "High", warning: "Warning", info: "Info" } as const;
const SOURCE: Record<string, string> = {
  default: "Default",
  user: "User",
  ai_prompt: "From prompt",
  ai_document: "From document",
  site_context: "Site lookup",
};

export type ReportModel = {
  projectName: string;
  municipality: string;
  generatedOn: string;
  startDate: string;
  durationMonths: number;
  description: string;
  sampleData: boolean;
  summary: string;
  headline: {
    p10: number;
    p50: number;
    p80: number;
    p90: number;
    estimateClass: string;
    lowPct: number;
    highPct: number;
  };
  costBuildUp: { label: string; amount: number }[];
  risk: {
    contingency: number;
    contingencyPct: number;
    overrunProbability: number;
    typicalOverrunPct: number;
    note: string;
  };
  components: {
    name: string;
    type: string;
    estimateClass: string;
    p10: number;
    p50: number;
    p90: number;
    share: number;
  }[];
  undrawnComponents: number;
  categories: { category: string; total: number }[];
  drivers: { label: string; low: number; high: number }[];
  flags: {
    severity: string;
    title: string;
    explanation: string;
    costEffect: string;
    where: string;
  }[];
  /** Same issue on several components → one row (the PDF uses these). */
  flagGroups: {
    severity: string;
    title: string;
    details: string;
    where: string;
  }[];
  settings: { label: string; value: string }[];
  assumptions: {
    component: string;
    parameter: string;
    value: string;
    source: string;
    evidence: string;
  }[];
  lineItems: {
    component: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    quantitySource: string;
    unitPriceLow: number;
    unitPrice: number;
    unitPriceHigh: number;
    unitPriceSource: string;
    total: number;
    overridden: string;
    lowConfidence: boolean;
  }[];
  scenarios: { name: string; notes: string; changes: string }[];
  sources: string[];
};

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatParam(def: ParamDefinition, value: ParamValue): string {
  if (def.type === "boolean") return value ? "Yes" : "No";
  if (def.type === "enum")
    return (
      def.options?.find((o) => o.value === value)?.label.en ?? String(value)
    );
  return def.unit ? `${value} ${def.unit}` : String(value);
}

export function buildReport(
  project: Project,
  components: Component[],
  estimate: Estimate,
  today = new Date(),
): ReportModel {
  const names = new Map(components.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) =>
    id === null ? "Project-wide" : (names.get(id) ?? id);
  const d = estimate.distribution;
  const soft = estimate.softCosts;
  const contingency = estimate.recommendedContingency;
  const high = estimate.flags.filter((f) => f.severity === "high").length;
  const biggest = [...estimate.components].sort((a, b) => b.p50 - a.p50)[0];

  const summary = [
    `${project.name} (${project.municipality || "Ontario"}) is estimated at ${compact.format(d.p50)} (P50), with a likely range of ${compact.format(d.p10)} to ${compact.format(d.p90)} (P10–P90).`,
    `This is a Class ${estimate.estimateClass} estimate (expected accuracy ${estimate.classRange.lowPct}% to +${estimate.classRange.highPct}%) covering ${estimate.components.length} component${estimate.components.length === 1 ? "" : "s"}.`,
    biggest
      ? `${biggest.name} is the largest cost at ${Math.round(biggest.share * 100)}% of the total.`
      : "",
    `A contingency of ${compact.format(contingency.amount)} (${Math.round(contingency.pct)}%) is recommended; the chance of exceeding the P50 budget is about ${Math.round(estimate.overrunRisk.probabilityOfOverrun * 100)}%.`,
    high > 0
      ? `${high} high-severity flag${high === 1 ? " needs" : "s need"} attention before the budget is approved.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const costBuildUp = [
    { label: "Direct construction cost", amount: estimate.directCost },
    { label: "Engineering", amount: soft.engineering },
    { label: "Contract administration", amount: soft.contractAdmin },
    { label: "Permits and approvals", amount: soft.permitsApprovals },
    { label: "Project management", amount: soft.projectManagement },
    ...(soft.ffe
      ? [{ label: "Furniture, fixtures and equipment", amount: soft.ffe }]
      : []),
    {
      label: "Escalation to construction midpoint",
      amount: estimate.escalation,
    },
    { label: "Taxes (net HST)", amount: estimate.taxes },
    {
      label: "Base estimate (before contingency)",
      amount: estimate.baseEstimate,
    },
    {
      label: `Recommended contingency (${Math.round(contingency.pct)}%)`,
      amount: contingency.amount,
    },
    {
      label: "Base estimate plus contingency",
      amount: estimate.baseEstimate + contingency.amount,
    },
  ];

  const totals = new Map<LineItemCategory, number>();
  for (const l of estimate.lineItems)
    totals.set(l.category, (totals.get(l.category) ?? 0) + l.total);

  const assumptions = components.flatMap((c) => {
    const catalog = templates[c.type]?.paramCatalog ?? [];
    return catalog
      .filter((def) => c.params[def.id] !== undefined)
      .map((def) => ({
        component: c.name,
        parameter: def.label.en,
        value: formatParam(def, c.params[def.id]!),
        source: SOURCE[c.paramMeta[def.id]?.source ?? "default"] ?? "Default",
        evidence: c.paramMeta[def.id]?.evidence ?? "",
      }));
  });

  const s = project.settings;
  const settings = [
    { label: "Start date", value: s.startDate },
    { label: "Duration", value: `${s.durationMonths} months` },
    {
      label: "Pricing region",
      value:
        regionalFactors.regions.find((x) => x.key === project.region)?.name
          .en ?? project.region,
    },
    {
      label: "Escalation rate",
      value: `${(estimate.escalationDetail.annualRate * 100).toFixed(1)}% per year`,
    },
    ...(estimate.escalationDetail.bcpiLabel
      ? [
          {
            label: "Price index",
            value: estimate.escalationDetail.bcpiLabel.en,
          },
        ]
      : []),
    { label: "Tax rate (net HST)", value: `${(s.taxRate * 100).toFixed(2)}%` },
    {
      label: "Contingency",
      value:
        s.contingencyMode === "manual"
          ? `Manual, ${s.manualContingencyPct}%`
          : "Recommended (from the simulation)",
    },
  ];

  const sources = [
    "Building rates: Altus Group 2026 Canadian Cost Guide (Ontario ranges), escalated with Statistics Canada BCPI.",
    "Price trend: Statistics Canada Building Construction Price Index (table 18-10-0289-01).",
    "Comparable contracts: CanadaBuys award notices (Open Government Licence – Canada).",
    "Basemap and site context (nearby schools, water, rail, buildings): © OpenStreetMap contributors (ODbL).",
    "Zoning (advisory): City of Waterloo By-law 2018-050, City of Ottawa By-law 2008-250, City of Cambridge By-law 150-85.",
  ];
  if (estimate.sampleData)
    sources.push(
      "Road, park and structure unit prices are sample Ontario values for demonstration. Replace with municipal tender results before use.",
    );

  return {
    projectName: project.name,
    municipality: project.municipality,
    generatedOn: today.toISOString().slice(0, 10),
    startDate: s.startDate,
    durationMonths: s.durationMonths,
    description: project.description,
    sampleData: estimate.sampleData,
    summary,
    headline: {
      p10: d.p10,
      p50: d.p50,
      p80: d.p80,
      p90: d.p90,
      estimateClass: estimate.estimateClass,
      lowPct: estimate.classRange.lowPct,
      highPct: estimate.classRange.highPct,
    },
    costBuildUp,
    risk: {
      contingency: contingency.amount,
      contingencyPct: contingency.pct,
      overrunProbability: estimate.overrunRisk.probabilityOfOverrun,
      typicalOverrunPct: estimate.overrunRisk.typicalOverrunPct,
      note: estimate.overrunRisk.referenceNote.en,
    },
    components: estimate.components.map((c) => ({
      name: c.name,
      type: c.type,
      estimateClass: c.estimateClass,
      p10: c.p10,
      p50: c.p50,
      p90: c.p90,
      share: c.share,
    })),
    undrawnComponents: estimate.undrawnComponents,
    categories: [...totals]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => ({ category: CATEGORY[cat] ?? cat, total })),
    drivers: estimate.drivers.map((dr) => ({
      label: dr.label.en,
      low: dr.impactLow,
      high: dr.impactHigh,
    })),
    flags: [...estimate.flags]
      .sort(
        (a, b) =>
          ["high", "warning", "info"].indexOf(a.severity) -
          ["high", "warning", "info"].indexOf(b.severity),
      )
      .map((f) => ({
        severity: SEVERITY[f.severity],
        title: f.title.en,
        explanation: f.explanation.en,
        costEffect: f.costEffect?.en ?? "",
        where:
          f.componentIds.length === 0
            ? "Project-wide"
            : f.componentIds.map(nameOf).join(", "),
      })),
    flagGroups: groupFlags(estimate.flags).map((g) => ({
      severity: SEVERITY[g.severity],
      title: g.title,
      details: [
        g.explanation,
        g.costEffect,
        ...(g.items.length > 1 || g.items.some((i) => i.detail)
          ? g.items.map((i) =>
              [
                `- ${i.componentIds.length ? i.componentIds.map(nameOf).join(", ") : "Project-wide"}:`,
                i.detail,
                i.costEffect,
              ]
                .filter(Boolean)
                .join(" "),
            )
          : []),
      ]
        .filter(Boolean)
        .join("\n"),
      where: [
        ...new Set(
          g.items.flatMap((i) =>
            i.componentIds.length
              ? i.componentIds.map(nameOf)
              : ["Project-wide"],
          ),
        ),
      ].join(", "),
    })),
    settings,
    assumptions,
    lineItems: estimate.lineItems.map((l) => ({
      component: nameOf(l.componentId),
      category: CATEGORY[l.category] ?? l.category,
      description: l.description.en,
      quantity: l.quantity,
      unit: l.unit,
      quantitySource: l.quantitySource.en,
      unitPriceLow: l.unitPrice.low,
      unitPrice: l.unitPrice.typical,
      unitPriceHigh: l.unitPrice.high,
      unitPriceSource: l.unitPriceSource.en,
      total: l.total,
      overridden: [
        l.isQuantityOverridden && "quantity",
        l.isPriceOverridden && "price",
      ]
        .filter(Boolean)
        .join(", "),
      lowConfidence: l.lowConfidence,
    })),
    scenarios: project.scenarios.map((sc) => ({
      name: sc.name,
      notes: sc.notes ?? "",
      changes:
        [
          sc.removedComponentIds.length &&
            `removes ${sc.removedComponentIds.map(nameOf).join(", ")}`,
          sc.addedComponents.length &&
            `adds ${sc.addedComponents.map((c) => c.name).join(", ")}`,
          Object.keys(sc.componentOverrides).length &&
            `changes ${Object.keys(sc.componentOverrides).length} component(s)`,
          sc.startDateOverride && `starts ${sc.startDateOverride}`,
        ]
          .filter(Boolean)
          .join("; ") || "Baseline",
    })),
    sources,
  };
}

export { money as formatMoney, compact as formatCompact };

/** "Northgate hub!" → "northgate-hub-report" (extension added by the caller). */
export function reportBaseName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "project"}-cost-estimate`;
}
