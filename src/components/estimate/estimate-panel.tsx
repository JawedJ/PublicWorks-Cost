"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { scopeEstimate } from "@/lib/estimate/scope";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { useZoningLookup } from "@/lib/zoning/useZoningLookup";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";
import { EstimateTab } from "./estimate-tab";
import { QuestionsPanel } from "@/components/questions/questions-panel";
import { InputsTab } from "./inputs-tab";
import { LineItemsTab } from "./line-items-tab";

const TABS = ["estimate", "questions", "lineItems", "inputs"] as const;
type Tab = (typeof TABS)[number];

// Right panel. A mounts it in the workspace layout (P3.2).
// Scope (P3.5) = the shared selection: whole project, or the selected component.
// Tabs: Estimate (P3.6), Questions (P7.5), Line items (P3.10), Inputs (P3.11).

export function EstimatePanel() {
  const t = useTranslations("estimate");
  const { estimate, computing } = useEstimate();
  // Zoning (SPEC 8.3) is looked up in the background while the workspace is open.
  useZoningLookup();
  const selectComponent = useStore((s) => s.selectComponent);
  const selectedId = useStore((s) => s.selectedComponentId);
  const components = useStore((s) => s.components);
  const region = useStore((s) => s.project.region);
  const [tab, setTab] = useState<Tab>("estimate");
  // Creation flow (P7.4, A): once the last planned component is placed, go to Questions.
  const planned = components.filter((c) => c.status === "planned").length;
  const [prevPlanned, setPrevPlanned] = useState(planned);
  if (planned !== prevPlanned) {
    setPrevPlanned(planned);
    if (prevPlanned > 0 && planned === 0 && components.length > 0)
      setTab("questions");
  }

  if (!estimate || estimate.components.length === 0) {
    return (
      <section
        className="min-h-full bg-background p-4 text-sm text-muted-foreground"
        aria-live="polite"
      >
        {computing ? t("computing") : t("empty")}
      </section>
    );
  }
  const scoped = scopeEstimate(estimate, selectedId);

  return (
    <section
      className="flex min-h-full flex-col gap-4 bg-background p-4 *:shrink-0"
      aria-busy={computing}
    >
      <label className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">{t("scope")}</span>
        <select
          className="h-9 w-full min-w-0 rounded-full border bg-card px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      <div
        role="tablist"
        aria-label={t("tabs.label")}
        className="flex gap-1 overflow-x-auto rounded-full border bg-card p-1"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              tab === id
                ? "bg-foreground font-medium text-background"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "estimate" && (
          <EstimateTab
            estimate={estimate}
            scoped={scoped}
            components={components}
            region={region}
          />
        )}
        {tab === "questions" && (
          <QuestionsPanel
            estimate={estimate}
            components={components}
            componentId={scoped.component?.componentId ?? null}
          />
        )}
        {tab === "lineItems" && (
          <LineItemsTab estimate={estimate} scoped={scoped} />
        )}
        {tab === "inputs" && (
          <InputsTab
            components={components}
            componentId={scoped.component?.componentId ?? null}
          />
        )}
      </div>
    </section>
  );
}
