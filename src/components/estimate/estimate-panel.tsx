"use client";

import { useLocale, useTranslations } from "next-intl";
import { scopeEstimate } from "@/lib/estimate/scope";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { useStore } from "@/lib/store/store";

// Minimal estimate panel (P3.6 builds the full tabs). A mounts it in the workspace layout (P3.2).
// Scope (P3.5) = the shared selection: whole project, or the selected component.

export function EstimatePanel() {
  const t = useTranslations("estimate");
  const locale = useLocale() as "en" | "fr";
  const { estimate, computing } = useEstimate();
  const selectComponent = useStore((s) => s.selectComponent);
  const selectedId = useStore((s) => s.selectedComponentId);
  const money = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

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

      <div>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("title")}
        </h2>
        <p className="text-3xl font-semibold figures">
          {money.format(scoped.p50)}
        </p>
        <p className="text-sm text-muted-foreground figures">
          {t("range", {
            p10: money.format(scoped.p10),
            p90: money.format(scoped.p90),
          })}
        </p>
        <p className="mt-1 text-sm">
          {t("class", { cls: scoped.estimateClass })}
          {scoped.component
            ? ` · ${t("shareOfProject", { pct: Math.round(scoped.component.share * 100) })}`
            : ` · ${t("contingency", {
                amount: money.format(estimate.recommendedContingency.amount),
              })}`}
        </p>
      </div>

      {!scoped.component && (
        <ul className="flex flex-col divide-y text-sm">
          {estimate.components.map((c) => (
            <li key={c.componentId}>
              <button
                type="button"
                className="flex w-full justify-between gap-2 py-2 text-left hover:bg-muted/50"
                onClick={() => selectComponent(c.componentId)}
              >
                <span>{c.name}</span>
                <span className="figures">
                  {money.format(c.p50)} · {Math.round(c.share * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!scoped.component && estimate.undrawnComponents > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("undrawn", { count: estimate.undrawnComponents })}
        </p>
      )}

      {scoped.flags.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">{t("flags")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {scoped.flags.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.title[locale]}</span> —{" "}
                {f.explanation[locale]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {scoped.component && (
        <p className="text-xs text-muted-foreground">{t("componentNote")}</p>
      )}
    </section>
  );
}
