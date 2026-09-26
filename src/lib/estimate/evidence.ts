import {
  altusBenchmarks,
  buildingCosts,
  canadabuysAwards,
  regionalFactors,
  statcanBcpi,
} from "@/data";
import { measureComponent } from "@/lib/geo/measure";
import type {
  CanadaBuysAward,
  Component,
  ComponentType,
  Estimate,
} from "@/lib/schemas";

// P3.7 (SPEC 8.2): market evidence. Real public data shown next to the estimate
// as a cross-check. Nothing here feeds the engine.

const SQFT_PER_M2 = 10.7639;

export type Benchmark = {
  componentId: string;
  name: string;
  kind: "building" | "road";
  /** Our figure on the benchmark's basis: building $/sq ft (building only), road $/m. */
  ours: number;
  /** Buildings: everything on the component (site works, parking, premiums) per sq ft. */
  allIn?: number;
  range: [number, number];
  /** What the range is, e.g. "Library" or "Local road, 8 m wide". */
  basis: string;
  position: "below" | "within" | "above";
};

const ROAD_BENCHMARK: Record<string, string> = {
  local: "local_8m",
  collector: "arterial_9m",
  arterial: "arterial_12m",
};

const position = (v: number, [lo, hi]: [number, number]) =>
  v < lo ? "below" : v > hi ? "above" : "within";

/** Our $/unit vs Altus 2026 for each building and road in scope. */
export function benchmarks(
  estimate: Estimate,
  components: Component[],
  componentId: string | null,
): Benchmark[] {
  const out: Benchmark[] = [];
  for (const ce of estimate.components) {
    if (componentId && ce.componentId !== componentId) continue;
    const c = components.find((x) => x.id === ce.componentId);
    if (!c) continue;
    const m = measureComponent(c);

    if (c.type === "building") {
      const sub = buildingCosts.subtypes[c.subtype];
      const gfa = m.grossFloorAreaM2 ?? 0;
      if (!sub?.source || gfa <= 0) continue;
      const building = estimate.lineItems
        .filter((l) => l.componentId === c.id && l.elementRef?.sectionId)
        .reduce((s, l) => s + l.total, 0);
      const range: [number, number] = [
        sub.perM2.low / SQFT_PER_M2,
        sub.perM2.high / SQFT_PER_M2,
      ];
      const ours = building / gfa / SQFT_PER_M2;
      out.push({
        componentId: c.id,
        name: ce.name,
        kind: "building",
        ours,
        allIn: ce.directCost / gfa / SQFT_PER_M2,
        range,
        basis: sub.label.en,
        position: position(ours, range),
      });
    }

    if (c.type === "road") {
      const length = m.lengthM ?? 0;
      const roadClass = String(c.params.roadClass ?? "local");
      const row = altusBenchmarks.roads.find(
        (r) => r.id === ROAD_BENCHMARK[roadClass],
      );
      if (!row || length <= 0) continue;
      const range: [number, number] = [
        Math.min(row.perM.ottawa[0], row.perM.gta[0]),
        Math.max(row.perM.ottawa[1], row.perM.gta[1]),
      ];
      const ours = ce.directCost / length;
      out.push({
        componentId: c.id,
        name: ce.name,
        kind: "road",
        ours,
        range,
        basis: row.label,
        position: position(ours, range),
      });
    }
  }
  return out;
}

export type PriceTrend = {
  /** Change over the last 4 quarters, e.g. 0.031 = +3.1%. */
  change: number;
  latest: string;
  geo: string;
  type: string;
};

/** Year-over-year change of the non-residential BCPI for the project's reference CMA. */
export function priceTrend(regionKey: string): PriceTrend | null {
  const cma =
    regionalFactors.regions.find((r) => r.key === regionKey)?.referenceCma ??
    "toronto";
  const s = statcanBcpi.series.find(
    (x) =>
      x.geo === cma &&
      x.type === "non_residential" &&
      x.division === "composite",
  );
  const pts = s?.points;
  if (!s || !pts || pts.length < 5) return null;
  const [latest, last] = pts.at(-1)!;
  const prev = pts.at(-5)![1];
  return {
    change: last / prev - 1,
    latest,
    geo: statcanBcpi.geographies.find((g) => g.key === s.geo)?.name.en ?? s.geo,
    type:
      statcanBcpi.buildingTypes.find((t) => t.key === s.type)?.name.en ??
      s.type,
  };
}

const TYPE_TAGS: Record<ComponentType, string[]> = {
  road: ["road", "utilities"],
  park: ["park"],
  building: ["building"],
  structure: ["structure"],
  custom: [],
};

/** Most recent CanadaBuys awards tagged like the component types in scope. */
export function comparableAwards(
  types: ComponentType[],
  limit = 3,
): CanadaBuysAward[] {
  const tags = new Set(types.flatMap((t) => TYPE_TAGS[t]));
  return canadabuysAwards.awards
    .filter((a) => a.tags.some((t) => tags.has(t)))
    .sort((a, b) => (b.awardDate ?? "").localeCompare(a.awardDate ?? ""))
    .slice(0, limit);
}
