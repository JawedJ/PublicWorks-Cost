"use client";

import { ChartPie, Gauge, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { CLASS_RANGE } from "@/engine";
import type { ScopedEstimate } from "@/lib/estimate/scope";
import type { Component, Estimate } from "@/lib/schemas";
import {
  CategoryBreakdown,
  ComponentBreakdown,
  DistributionChart,
  PerUnitMetrics,
} from "./charts";
import { FlagsList } from "./flags-list";
import { MarketEvidenceCard } from "./market-evidence-card";
import { PanelCard, StatChip } from "./panel-ui";

// P3.6: Estimate tab. Headline range, class badge,
// contingency and overrun risk (whole project), per-component list, flags.

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = (n: number) => Math.round(n);

type Props = {
  estimate: Estimate;
  scoped: ScopedEstimate;
  /** Design components (for measurements in the market evidence card). */
  components: Component[];
  /** Project region key (for the StatCan trend). */
  region: string;
};

export function EstimateTab({ estimate, scoped, components, region }: Props) {
  const t = useTranslations("estimate");
  const names = new Map(
    estimate.components.map((c) => [c.componentId, c.name]),
  );
  const range = CLASS_RANGE[scoped.estimateClass];
  const whole = !scoped.component;

  return (
    <div className="flex flex-col gap-3">
      <PanelCard
        icon={Wallet}
        title={t("title")}
        subtitle={scoped.component ? scoped.component.name : t("wholeProject")}
      >
        <RangeDisplay p10={scoped.p10} p50={scoped.p50} p90={scoped.p90} />
        <div className="flex flex-wrap gap-1.5">
          <StatChip
            icon={Gauge}
            label={t("classChip")}
            value={`${scoped.estimateClass} (−${Math.abs(range.lowPct)}% / +${range.highPct}%)`}
          />
          {whole ? (
            <>
              <StatChip
                icon={ShieldCheck}
                label={t("contingencyChip")}
                value={`${pct(estimate.recommendedContingency.pct)}%`}
              />
              <StatChip
                icon={TrendingUp}
                label={t("overrunChip")}
                value={`${pct(estimate.overrunRisk.probabilityOfOverrun * 100)}%`}
              />
            </>
          ) : (
            <StatChip
              icon={ChartPie}
              label={t("shareChip")}
              value={`${pct(scoped.component!.share * 100)}%`}
            />
          )}
        </div>
      </PanelCard>

      {whole && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PanelCard icon={ShieldCheck} title={t("contingencyHeading")}>
            <div>
              <p className="text-2xl font-semibold figures">
                {money.format(estimate.recommendedContingency.amount)}
              </p>
              <p className="text-xs text-muted-foreground figures">
                {t("contingencyPct", {
                  pct: pct(estimate.recommendedContingency.pct),
                  base: money.format(estimate.baseEstimate),
                })}
              </p>
            </div>
          </PanelCard>
          <PanelCard icon={TrendingUp} title={t("overrunHeading")}>
            <div>
              <p className="text-2xl font-semibold figures">
                {t("overrunChance", {
                  pct: pct(estimate.overrunRisk.probabilityOfOverrun * 100),
                })}
              </p>
              <p className="text-xs text-muted-foreground figures">
                {t("overrunTypical", {
                  pct: pct(estimate.overrunRisk.typicalOverrunPct),
                })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {estimate.overrunRisk.referenceNote.en}
              </p>
            </div>
          </PanelCard>
        </div>
      )}

      {whole && <ComponentBreakdown estimate={estimate} />}

      {whole && <DistributionChart distribution={estimate.distribution} />}
      <CategoryBreakdown lineItems={scoped.lineItems} />

      <MarketEvidenceCard
        estimate={estimate}
        components={components}
        componentId={scoped.component?.componentId ?? null}
        region={region}
      />

      <FlagsList flags={scoped.flags} names={whole ? names : undefined} />

      {whole && <PerUnitMetrics metrics={estimate.perUnitMetrics} />}

      {!whole && (
        <p className="text-xs text-muted-foreground">{t("componentNote")}</p>
      )}
    </div>
  );
}

/** P10–P90 bar with the P50 marked. */
function RangeDisplay({
  p10,
  p50,
  p90,
}: {
  p10: number;
  p50: number;
  p90: number;
}) {
  const t = useTranslations("estimate");
  const at = p90 > p10 ? ((p50 - p10) / (p90 - p10)) * 100 : 50;
  return (
    <div>
      <p className="text-4xl font-semibold tracking-tight figures">
        {money.format(p50)}
      </p>
      <p className="text-xs text-muted-foreground">{t("p50Note")}</p>
      <div
        role="img"
        aria-label={t("range", {
          p10: money.format(p10),
          p90: money.format(p90),
        })}
        className="relative mt-4 h-2 rounded-full bg-linear-to-r from-chart-1/40 via-chart-3/60 to-chart-5/50"
      >
        <span
          className="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full border-4 border-card bg-primary"
          style={{ left: `${at}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground figures">
        <span>P10 {money.format(p10)}</span>
        <span>P90 {money.format(p90)}</span>
      </div>
    </div>
  );
}
