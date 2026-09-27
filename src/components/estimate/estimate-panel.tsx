"use client";

import { Calculator } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { scopeEstimate } from "@/lib/estimate/scope";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { useZoningLookup } from "@/lib/zoning/useZoningLookup";
import { useStore } from "@/lib/store/store";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstimateTab } from "./estimate-tab";
import { QuestionsPanel } from "@/components/questions/questions-panel";
import { loadQuestions } from "@/components/questions/questions";
import { ExportTab } from "./export-tab";
import { InputsTab } from "./inputs-tab";
import { LineItemsTab } from "./line-items-tab";

const TABS = [
  "estimate",
  "questions",
  "lineItems",
  "inputs",
  "export",
] as const;
type Tab = (typeof TABS)[number];

// Right panel. A mounts it in the workspace layout (P3.2).
// Scope (P3.5) = the shared selection: whole project, or the selected component.
// Tabs: Estimate (P3.6), Questions (P7.5), Line items (P3.10), Inputs (P3.11),
// Export (P5.4).

export function EstimatePanel() {
  const t = useTranslations("estimate");
  const { estimate, computing } = useEstimate();
  // Zoning (SPEC 8.3) is looked up in the background while the workspace is open.
  useZoningLookup();
  const selectComponent = useStore((s) => s.selectComponent);
  const selectedId = useStore((s) => s.selectedComponentId);
  const components = useStore((s) => s.components);
  const region = useStore((s) => s.project.region);
  // Always opens on Estimate (per the human; no longer jumps to Questions).
  const [tab, setTab] = useState<Tab>("estimate");
  // Questions are generated in the background, once per project and set of
  // components (waiting for drawing to settle), not each time the tab opens.
  // Existing-building flags come from the site lookup, which lands a bit later.
  const componentKey = [
    estimate?.components.map((c) => c.componentId).join(),
    estimate?.flags
      .filter((f) => f.code.startsWith("existing_buildings"))
      .flatMap((f) => f.componentIds)
      .join(),
  ].join("|");
  useEffect(() => {
    if (!estimate?.components.length) return;
    const timer = setTimeout(() => void loadQuestions(estimate), 2000);
    return () => clearTimeout(timer);
    // Only the component set matters; answers and edits don't re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentKey]);
  if (!estimate || estimate.components.length === 0) {
    return (
      <section className="min-h-full bg-background p-4" aria-live="polite">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Calculator />
            </EmptyMedia>
            <EmptyTitle>
              {computing ? t("computing") : t("emptyTitle")}
            </EmptyTitle>
            {!computing && <EmptyDescription>{t("empty")}</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      </section>
    );
  }
  const scoped = scopeEstimate(estimate, selectedId);

  const PROJECT = "__project";
  const scopeId = scoped.component?.componentId ?? null;

  return (
    <section
      className="flex min-h-full flex-col gap-4 bg-background p-4 *:shrink-0"
      aria-busy={computing}
    >
      <Select
        value={scopeId ?? PROJECT}
        onValueChange={(v) => selectComponent(v === PROJECT ? null : v)}
      >
        <SelectTrigger aria-label={t("scope")} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={PROJECT}>{t("wholeProject")}</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>{t("components")}</SelectLabel>
            {estimate.components.map((c) => (
              <SelectItem key={c.componentId} value={c.componentId}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label={t("tabs.label")} className="w-full">
          {TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="estimate">
          <EstimateTab
            estimate={estimate}
            scoped={scoped}
            components={components}
            region={region}
          />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsPanel
            estimate={estimate}
            components={components}
            componentId={scopeId}
          />
        </TabsContent>
        <TabsContent value="lineItems">
          <LineItemsTab estimate={estimate} scoped={scoped} />
        </TabsContent>
        <TabsContent value="inputs">
          <InputsTab
            components={components}
            componentId={scopeId}
            flags={estimate.flags}
          />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab estimate={estimate} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
