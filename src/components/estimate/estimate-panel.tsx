"use client";

import { useTranslations } from "next-intl";
import { scopeEstimate } from "@/lib/estimate/scope";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { useStore } from "@/lib/store/store";
import { EstimateTab } from "./estimate-tab";

// Right panel. A mounts it in the workspace layout (P3.2).
// Scope (P3.5) = the shared selection: whole project, or the selected component.
// Tabs: Estimate (P3.6); Line items (P3.10) and Inputs (P3.11) come next.

export function EstimatePanel() {
  const t = useTranslations("estimate");
  const { estimate, computing } = useEstimate();
  const selectComponent = useStore((s) => s.selectComponent);
  const selectedId = useStore((s) => s.selectedComponentId);

  if (!estimate || estimate.components.length === 0) {
    return (
      <section className="p-4 text-sm text-muted-foreground" aria-live="polite">
        {computing ? t("computing") : t("empty")}
      </section>
    );
  }
  const scoped = scopeEstimate(estimate, selectedId);

  return (
    <section className="flex flex-col gap-4 p-4" aria-busy={computing}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("scope")}</span>
        <select
          className="rounded-md border bg-background px-2 py-1.5"
          value={scoped.component?.componentId ?? ""}
          onChange={(e) => selectComponent(e.target.value || null)}
        >
          <option value="">{t("wholeProject")}</option>
          {estimate.components.map((c) => (
            <option key={c.componentId} value={c.componentId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <EstimateTab estimate={estimate} scoped={scoped} />
    </section>
  );
}
