"use client";

import { useTranslations } from "next-intl";
import type { Estimate, LineItem } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// P3.8: estimate visuals, drawn with plain divs (no chart library).
// Per-component breakdown, cost distribution, category breakdown, drivers
// tornado, per-unit metrics.

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
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-indigo-500",
];

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-medium">{children}</h3>;
}

/** Stacked bar of component P50 shares, plus a clickable table. */
export function ComponentBreakdown({ estimate }: { estimate: Estimate }) {
  const t = useTranslations("charts");
  const tEst = useTranslations("estimate");
  const selectComponent = useStore((s) => s.selectComponent);
  const comps = estimate.components;
  return (
    <div>
      <Heading>{t("byComponent")}</Heading>
      <div
        role="img"
        aria-label={t("byComponentLabel")}
        className="flex h-4 overflow-hidden rounded-full"
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
      <ul className="mt-2 flex flex-col divide-y text-sm">
        {comps.map((c, i) => (
          <li key={c.componentId}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-muted/50"
              onClick={() => selectComponent(c.componentId)}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-sm ${PALETTE[i % PALETTE.length]}`}
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
    </div>
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
    <div>
      <Heading>{t("distribution")}</Heading>
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
            className={`flex-1 rounded-t-sm ${
              b.bin + width < d.p10 || b.bin > d.p90
                ? "bg-muted-foreground/25"
                : "bg-primary/50"
            }`}
            style={{ height: `${(b.count / max) * 100}%` }}
          />
        ))}
        {marks.map((m) => (
          <span
            key={m.id}
            className={`absolute inset-y-0 w-px ${m.id === "P50" ? "bg-primary" : "bg-foreground/40"}`}
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
    </div>
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
    <div>
      <Heading>{t("byCategory")}</Heading>
      <ul className="flex flex-col gap-1.5 text-sm">
        {rows.map(([cat, v]) => (
          <li
            key={cat}
            className="grid grid-cols-[7rem_1fr_auto] items-center gap-2"
          >
            <span className="truncate">{tCat(cat)}</span>
            <span className="h-2 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/60"
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
    </div>
  );
}

/** Tornado: how much the project P50 moves when each driver swings low/high. */
export function DriversTornado({ drivers }: { drivers: Estimate["drivers"] }) {
  const t = useTranslations("charts");
  if (drivers.length === 0) return null;
  const max =
    Math.max(
      ...drivers.map((d) =>
        Math.max(Math.abs(d.impactLow), Math.abs(d.impactHigh)),
      ),
    ) || 1;
  const w = (v: number) => `${(Math.abs(v) / max) * 50}%`;
  return (
    <div>
      <Heading>{t("drivers")}</Heading>
      <ul className="flex flex-col gap-1.5 text-sm">
        {drivers.map((d) => (
          <li key={d.id}>
            <p className="flex justify-between text-xs">
              <span>{d.label.en}</span>
              <span className="text-muted-foreground figures">
                {compact.format(d.impactLow)} / +{compact.format(d.impactHigh)}
              </span>
            </p>
            <div className="relative h-2.5">
              <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
              <span
                className="absolute inset-y-0 right-1/2 rounded-l-full bg-emerald-500/60"
                style={{ width: w(d.impactLow) }}
              />
              <span
                className="absolute inset-y-0 left-1/2 rounded-r-full bg-rose-500/60"
                style={{ width: w(d.impactHigh) }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">{t("driversNote")}</p>
    </div>
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
    <div>
      <Heading>{t("perUnit")}</Heading>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {shown.map((r) => (
          <div key={r.id} className="rounded-md bg-muted/50 p-2">
            <dt className="text-xs text-muted-foreground">
              {t(`units.${r.id}`)}
            </dt>
            <dd className="font-medium figures">{money.format(r.v!)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
