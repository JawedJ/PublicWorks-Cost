"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { altusBenchmarks, canadabuysAwards, statcanBcpi } from "@/data";
import {
  benchmarks,
  comparableAwards,
  priceTrend,
} from "@/lib/estimate/evidence";
import type { Component, Estimate } from "@/lib/schemas";

// P3.7 (SPEC 8.2): real public data next to the estimate, as a cross-check.
// Benchmarks against Altus 2026, the StatCan price trend, and similar CanadaBuys
// awards. Nothing here changes the estimate. Starts collapsed.

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

type Props = {
  estimate: Estimate;
  components: Component[];
  componentId: string | null;
  region: string;
};

export function MarketEvidenceCard({
  estimate,
  components,
  componentId,
  region,
}: Props) {
  const t = useTranslations("evidence");
  const bench = benchmarks(estimate, components, componentId);
  const trend = priceTrend(region);
  const types = [
    ...new Set(
      estimate.components
        .filter((c) => !componentId || c.componentId === componentId)
        .map((c) => c.type),
    ),
  ];
  const awards = comparableAwards(types);

  return (
    <details className="group rounded-lg border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
        {t("title")}
      </summary>
      <div className="flex flex-col gap-3 border-t p-3">
        {bench.length > 0 && (
          <div className="flex flex-col gap-3">
            {bench.map((b) => {
              const unit = b.kind === "building" ? t("perSqft") : t("perM");
              return (
                <div key={b.componentId} className="flex flex-col gap-1">
                  <p className="flex justify-between gap-2">
                    <span>{b.name}</span>
                    <span className="font-medium figures">
                      {money.format(b.ours)}
                      {unit}
                    </span>
                  </p>
                  <RangeBar value={b.ours} range={b.range} />
                  <p className="text-xs text-muted-foreground figures">
                    {t("altusRange", {
                      basis: b.basis,
                      low: money.format(b.range[0]),
                      high: money.format(b.range[1]),
                      unit,
                    })}{" "}
                    ·{" "}
                    <span className="text-foreground">
                      {t(`position.${b.position}`)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.kind === "building"
                      ? t("buildingNote", {
                          allIn: money.format(b.allIn ?? 0),
                        })
                      : t("roadNote")}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {trend && (
          <p>
            {Math.abs(trend.change) < 0.0005
              ? t("trendFlat", {
                  type: trend.type.toLowerCase(),
                  geo: trend.geo,
                })
              : t("trend", {
                  type: trend.type.toLowerCase(),
                  geo: trend.geo,
                  change: pct.format(trend.change),
                })}{" "}
            <span className="text-muted-foreground">
              ({t("statcan", { quarter: trend.latest })})
            </span>
          </p>
        )}

        {awards.length > 0 && (
          <div>
            <p className="mb-1 text-muted-foreground">{t("awardsHeading")}</p>
            <ul className="flex flex-col gap-1.5">
              {awards.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1 underline-offset-2 hover:underline"
                  >
                    {a.title.en}
                    <ExternalLink className="mt-0.5 size-3 shrink-0" />
                  </a>
                  <p className="text-xs text-muted-foreground figures">
                    {[
                      a.buyer,
                      compact.format(a.valueCad),
                      a.awardDate?.slice(0, 7),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("footnote", {
            altusDate: altusBenchmarks.meta.retrievedAt,
            statcanDate: statcanBcpi.source.releaseTime.slice(0, 10),
            canadabuysDate: canadabuysAwards.source.retrievedAt.slice(0, 10),
          })}
        </p>
      </div>
    </details>
  );
}

/** Where our figure sits against the benchmark range (range drawn in the middle 60%). */
function RangeBar({
  value,
  range: [lo, hi],
}: {
  value: number;
  range: [number, number];
}) {
  const span = hi - lo || 1;
  const at = Math.min(100, Math.max(0, 20 + ((value - lo) / span) * 60));
  return (
    <div aria-hidden className="relative h-2 rounded-full bg-muted">
      <span className="absolute inset-y-0 left-[20%] w-[60%] rounded-full bg-emerald-500/30" />
      <span
        className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-primary"
        style={{ left: `${at}%` }}
      />
    </div>
  );
}
