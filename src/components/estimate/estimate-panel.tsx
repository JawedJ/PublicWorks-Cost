"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { useStore } from "@/lib/store/store";

// Minimal estimate panel (P3.6 builds the full tabs). A mounts it in the workspace layout (P3.2).

export function EstimatePanel() {
  const t = useTranslations("estimate");
  const locale = useLocale() as "en" | "fr";
  const { estimate, computing } = useEstimate();
  const selectComponent = useStore((s) => s.selectComponent);
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
  const d = estimate.distribution;

  return (
    <section className="flex flex-col gap-4 p-4" aria-busy={computing}>
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("title")}
        </h2>
        <p className="text-3xl font-semibold figures">{money.format(d.p50)}</p>
        <p className="text-sm text-muted-foreground figures">
          {t("range", { p10: money.format(d.p10), p90: money.format(d.p90) })}
        </p>
        <p className="mt-1 text-sm">
          {t("class", { cls: estimate.estimateClass })} ·{" "}
          {t("contingency", {
            amount: money.format(estimate.recommendedContingency.amount),
          })}
        </p>
      </div>

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

      {estimate.undrawnComponents > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("undrawn", { count: estimate.undrawnComponents })}
        </p>
      )}

      {estimate.flags.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">{t("flags")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {estimate.flags.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.title[locale]}</span> —{" "}
                {f.explanation[locale]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("componentNote")}</p>
    </section>
  );
}
