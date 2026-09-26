import type {
  ComponentEstimate,
  Estimate,
  Flag,
  LineItem,
} from "@/lib/schemas";

// P3.5: the panel's scope is the shared selection (`selectedComponentId`).
// null = whole project. Every tab reads its figures through `scopeEstimate`.

export type ScopedEstimate = {
  /** The selected component, or null for the whole project. */
  component: ComponentEstimate | null;
  p10: number;
  p50: number;
  p90: number;
  estimateClass: Estimate["estimateClass"];
  lineItems: LineItem[];
  flags: Flag[];
};

export function scopeEstimate(
  estimate: Estimate,
  componentId: string | null,
): ScopedEstimate {
  const component =
    estimate.components.find((c) => c.componentId === componentId) ?? null;
  if (!component) {
    const d = estimate.distribution;
    return {
      component: null,
      p10: d.p10,
      p50: d.p50,
      p90: d.p90,
      estimateClass: estimate.estimateClass,
      lineItems: estimate.lineItems,
      flags: estimate.flags,
    };
  }
  const id = component.componentId;
  return {
    component,
    p10: component.p10,
    p50: component.p50,
    p90: component.p90,
    estimateClass: component.estimateClass,
    lineItems: estimate.lineItems.filter((l) => l.componentId === id),
    flags: estimate.flags.filter(
      (f) => f.componentIds.length === 0 || f.componentIds.includes(id),
    ),
  };
}
