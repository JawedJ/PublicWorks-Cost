"use client";

import { ChartArea, ChartColumn, Layers, Ruler } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Estimate, LineItem } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";
import { PanelCard } from "./panel-ui";

// P3.8: estimate visuals, drawn with plain divs (no chart library).
// Per-component breakdown, cost distribution, category breakdown and
// per-unit metrics.

const compact = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

/** Component colours, in estimate order. */
export const PALETTE = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-1/55",
  "bg-chart-2/55",
  "bg-chart-4/55",
];

/** Stacked bar of component P50 shares, plus a clickable table. */
export function ComponentBreakdown({ estimate }: { estimate: Estimate }) {
  const t = useTranslations("charts");
  const tEst = useTranslations("estimate");
  const selectComponent = useStore((s) => s.selectComponent);
  const comps = estimate.components;
  return (
    <PanelCard icon={Layers} title={t("byComponent")}>
      <div
        role="img"
        aria-label={t("byComponentLabel")}
        className="flex h-3 gap-0.5 overflow-hidden rounded-full"
      >
        {comps.map((c, i) => (
          <span
            key={c.componentId}
            className={PALETTE[i % PALETTE.length]}
            style={{ width: `${c.share * 100}%` }}
            title={`${c.name}: ${Math.round(c.share * 100)}%`}
          />
        ))}
      </div>
      <ul className="flex flex-col text-sm">
        {comps.map((c, i) => (
          <li key={c.componentId}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left hover:bg-secondary"
              onClick={() => selectComponent(c.componentId)}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    PALETTE[i % PALETTE.length],
                  )}
                />
                {c.name}
              </span>
              <span className="figures">
                {compact.format(c.p50)} · {Math.round(c.share * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
      {estimate.undrawnComponents > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          {tEst("undrawn", { count: estimate.undrawnComponents })}
        </p>
      )}
    </PanelCard>
  );
}

/** Monte Carlo histogram with P10 / P50 / P90 marked. */
export function DistributionChart({
  distribution: d,
}: {
  distribution: Estimate["distribution"];
}) {
  const t = useTranslations("charts");
  const bins = d.histogram;
  if (bins.length < 2) return null;
  const max = Math.max(...bins.map((b) => b.count)) || 1;
  const lo = bins[0]!.bin;
  const width = bins[1]!.bin - lo;
  const hi = bins.at(-1)!.bin + width;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const marks = [
    { id: "P10", v: d.p10 },
    { id: "P50", v: d.p50 },
    { id: "P90", v: d.p90 },
  ];
  return (
    <PanelCard icon={ChartArea} title={t("distribution")}>
      <div
        role="img"
        aria-label={t("distributionLabel", {
          p10: compact.format(d.p10),
          p50: compact.format(d.p50),
          p90: compact.format(d.p90),
        })}
        className="relative flex h-24 items-end gap-px"
      >
        {bins.map((b) => (
          <span
            key={b.bin}
            className={cn(
              "flex-1 rounded-t-sm",
              b.bin + width < d.p10 || b.bin > d.p90
                ? "bg-chart-2/30"
                : "bg-chart-2",
            )}
            style={{ height: `${(b.count / max) * 100}%` }}
          />
        ))}
        {marks.map((m) => (
          <span
            key={m.id}
            className={cn(
              "absolute inset-y-0 w-px",
              m.id === "P50" ? "w-0.5 bg-primary" : "bg-foreground/40",
            )}
            style={{ left: `${at(m.v)}%` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-xs text-muted-foreground figures">
        {marks.map((m) => (
          <span
            key={m.id}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${Math.min(92, Math.max(8, at(m.v)))}%` }}
          >
            {m.id}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("distributionNote")}</p>
    </PanelCard>
  );
}

/** Direct cost by category for the scoped line items, largest first. */
export function CategoryBreakdown({ lineItems }: { lineItems: LineItem[] }) {
  const t = useTranslations("charts");
  const tCat = useTranslations("lineItems.categories");
  const totals = new Map<LineItem["category"], number>();
  for (const l of lineItems)
    totals.set(l.category, (totals.get(l.category) ?? 0) + l.total);
  const rows = [...totals].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  const max = rows[0]![1];
  const sum = rows.reduce((s, [, v]) => s + v, 0);
  return (
    <PanelCard icon={ChartColumn} title={t("byCategory")}>
      <ul className="flex flex-col gap-1.5 text-sm">
        {rows.map(([cat, v]) => (
          <li
            key={cat}
            className="grid grid-cols-[7rem_1fr_auto] items-center gap-2"
          >
            <span className="truncate">{tCat(cat)}</span>
            <span className="h-2 rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-chart-1"
                style={{ width: `${(v / max) * 100}%` }}
              />
            </span>
            <span className="w-24 text-right text-xs figures">
              {compact.format(v)} · {Math.round((v / sum) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("byCategoryNote")}
      </p>
    </PanelCard>
  );
}

/** Whole-project cost per unit of what was drawn. */
export function PerUnitMetrics({
  metrics,
}: {
  metrics: Estimate["perUnitMetrics"];
}) {
  const t = useTranslations("charts");
  const rows = [
    { id: "perM", v: metrics.perM },
    { id: "perM2", v: metrics.perM2 },
    { id: "perM2GFA", v: metrics.perM2GFA },
  ] as const;
  const shown = rows.filter((r) => r.v !== undefined);
  if (shown.length === 0) return null;
  return (
    <PanelCard icon={Ruler} title={t("perUnit")}>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {shown.map((r) => (
          <div key={r.id} className="rounded-xl bg-secondary p-3">
            <dt className="text-xs text-muted-foreground">
              {t(`units.${r.id}`)}
            </dt>
            <dd className="text-lg font-semibold figures">
              {money.format(r.v!)}
            </dd>
          </div>
        ))}
      </dl>
    </PanelCard>
  );
}
