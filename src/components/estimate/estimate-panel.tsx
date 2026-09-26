"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { scopeEstimate } from "@/lib/estimate/scope";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { useStore } from "@/lib/store/store";
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
  const selectComponent = useStore((s) => s.selectComponent);
  const selectedId = useStore((s) => s.selectedComponentId);
  const components = useStore((s) => s.components);
  const region = useStore((s) => s.project.region);
  const [tab, setTab] = useState<Tab>("estimate");
  // An improvement hint was clicked: the Inputs tab scrolls to and focuses that field.
  const [focusParam, setFocusParam] = useState<{
    componentId: string;
    paramId: string;
  } | null>(null);
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
      <div
        role="tablist"
        aria-label={t("tabs.label")}
        className="flex gap-1 border-b"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              tab === id
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
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
            onAnswer={(componentId, paramId) => {
              selectComponent(componentId);
              setFocusParam({ componentId, paramId });
              setTab("inputs");
            }}
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
            focus={focusParam}
            onFocused={() => setFocusParam(null)}
          />
        )}
      </div>
    </section>
  );
}
