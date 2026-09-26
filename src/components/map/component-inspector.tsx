"use client";

import { Merge, Minus, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { formatArea, formatLength } from "@/lib/geo/format";
import { measureComponent, measureProject } from "@/lib/geo/measure";
import { intlLocale, type Locale } from "@/lib/i18n/routing";
import { RoofTypeSchema, type Component } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";
import { RoadCrossSection } from "@/components/visuals/road-cross-section";
import { SiteContextPanel } from "./site-context";
import { useDesignWarnings } from "./warning-markers";

// Measurements for the selected component (P1.15), per-section storeys and roof
// for buildings (P1.8), and project totals. Units toggle metric/imperial.

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="figures">{value}</dd>
    </div>
  );
}

function UnitsToggle() {
  const t = useTranslations("design.inspector");
  const units = useStore((s) => s.unitSystem);
  const setUnits = useStore((s) => s.setUnitSystem);
  return (
    <div
      role="radiogroup"
      aria-label={t("units")}
      className="flex overflow-hidden rounded border text-[11px]"
    >
      {(["metric", "imperial"] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={units === u}
          onClick={() => setUnits(u)}
          className={cn(
            "px-2 py-0.5",
            units === u ? "bg-foreground text-background" : "hover:bg-muted",
          )}
        >
          {t(u)}
        </button>
      ))}
    </div>
  );
}

function Sections({ component }: { component: Component }) {
  const t = useTranslations("design.inspector");
  const locale = intlLocale[useLocale() as Locale];
  const units = useStore((s) => s.unitSystem);
  const selectedSectionId = useStore((s) => s.selectedElement?.sectionId);
  const { updateSection, removeElement, mergeSections, selectElement } =
    useStore.getState();
  const sections = component.geometry?.sections ?? [];
  const m = measureComponent(component);
  if (!sections.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">{t("sections")}</h4>
        {sections.length > 1 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              if (
                !mergeSections(
                  component.id,
                  sections.map((s) => s.id),
                )
              )
                window.alert(t("mergeFailed"));
            }}
          >
            <Merge /> {t("mergeAll")}
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {sections.map((s, i) => (
          <li
            key={s.id}
            className={cn(
              "rounded border p-1.5 text-xs",
              selectedSectionId === s.id && "border-primary",
            )}
            onClick={() =>
              selectElement({ componentId: component.id, sectionId: s.id })
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-medium">
                {s.use || t("sectionN", { n: i + 1 })}
              </span>
              <span className="text-muted-foreground figures">
                {formatArea(
                  m.sections?.[s.id]?.footprintM2 ?? 0,
                  units,
                  locale,
                )}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-xs"
                aria-label={t("fewerStoreys")}
                disabled={s.storeys <= 1}
                onClick={() =>
                  updateSection(component.id, s.id, { storeys: s.storeys - 1 })
                }
              >
                <Minus />
              </Button>
              <span className="w-12 text-center figures">
                {t("storeys", { n: s.storeys })}
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                aria-label={t("moreStoreys")}
                disabled={s.storeys >= 80}
                onClick={() =>
                  updateSection(component.id, s.id, { storeys: s.storeys + 1 })
                }
              >
                <Plus />
              </Button>
              <select
                aria-label={t("roof")}
                value={s.roof}
                onChange={(e) =>
                  updateSection(component.id, s.id, {
                    roof: RoofTypeSchema.parse(e.target.value),
                  })
                }
                className="ml-auto rounded border bg-background px-1 py-0.5"
              >
                {RoofTypeSchema.options.map((r) => (
                  <option key={r} value={r}>
                    {t(`roofs.${r}`)}
                  </option>
                ))}
              </select>
              {sections.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("deleteSection")}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeElement(component.id, { role: "section", id: s.id });
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComponentInspector() {
  const t = useTranslations("design.inspector");
  const tWarn = useTranslations("design.warnings");
  const warnings = useDesignWarnings();
  const selectComponent = useStore((s) => s.selectComponent);
  const locale = intlLocale[useLocale() as Locale];
  const units = useStore((s) => s.unitSystem);
  const components = useStore((s) => s.components);
  const areaBoundary = useStore((s) => s.areaBoundary);
  const selected = useStore((s) =>
    s.components.find((c) => c.id === s.selectedComponentId),
  );
  const totals = useMemo(
    () =>
      measureProject({ components, areaBoundary: areaBoundary ?? undefined })
        .totals,
    [components, areaBoundary],
  );
  const len = (m: number) => formatLength(m, units, locale);
  const area = (m: number) => formatArea(m, units, locale);
  const m = selected?.geometry ? measureComponent(selected) : null;

  return (
    <div className="space-y-3 border-t p-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("measurements")}</h3>
        <UnitsToggle />
      </div>
      {selected && (
        <div className="space-y-2">
          <p className="truncate font-medium">{selected.name}</p>
          {m ? (
            <dl className="space-y-0.5">
              {m.lengthM !== undefined && (
                <Row label={t("length")} value={len(m.lengthM)} />
              )}
              {m.areaM2 !== undefined && (
                <Row label={t("area")} value={area(m.areaM2)} />
              )}
              {m.perimeterM !== undefined && (
                <Row label={t("perimeter")} value={len(m.perimeterM)} />
              )}
              {m.footprintM2 !== undefined && (
                <Row label={t("footprint")} value={area(m.footprintM2)} />
              )}
              {m.grossFloorAreaM2 !== undefined && (
                <Row label={t("gfa")} value={area(m.grossFloorAreaM2)} />
              )}
              {Object.keys(m.features).length > 0 && (
                <Row
                  label={t("features")}
                  value={String(Object.keys(m.features).length)}
                />
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground">{t("notDrawn")}</p>
          )}
          {selected.type === "building" && <Sections component={selected} />}
          {selected.type === "road" && selected.geometry && (
            <RoadCrossSection road={selected} />
          )}
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            {t("warningsTitle", { n: warnings.length })}
          </h4>
          <ul className="max-h-28 space-y-1 overflow-y-auto">
            {warnings.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => selectComponent(w.componentIds[0] ?? null)}
                >
                  {tWarn(w.code, w.values)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SiteContextPanel />
      <div>
        <h4 className="mb-1 text-xs font-semibold">{t("totals")}</h4>
        <dl className="space-y-0.5">
          <Row label={t("roadLength")} value={len(totals.roadLengthM)} />
          <Row label={t("parkArea")} value={area(totals.parkAreaM2)} />
          <Row label={t("buildingGfa")} value={area(totals.buildingGfaM2)} />
          {totals.areaBoundaryM2 !== undefined && (
            <Row label={t("projectArea")} value={area(totals.areaBoundaryM2)} />
          )}
        </dl>
      </div>
    </div>
  );
}
