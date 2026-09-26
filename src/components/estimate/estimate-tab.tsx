"use client";

import { useTranslations } from "next-intl";
import { CLASS_RANGE } from "@/engine";
import type { ScopedEstimate } from "@/lib/estimate/scope";
import type { Component, Estimate } from "@/lib/schemas";
import {
  CategoryBreakdown,
  ComponentBreakdown,
  DistributionChart,
  DriversTornado,
  PerUnitMetrics,
} from "./charts";
import { FlagsList } from "./flags-list";
import { MarketEvidenceCard } from "./market-evidence-card";

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
    <div className="flex flex-col gap-5">
      <RangeDisplay p10={scoped.p10} p50={scoped.p50} p90={scoped.p90} />

      <Card>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-lg font-semibold text-primary-foreground"
          >
            {scoped.estimateClass}
          </span>
          <div className="text-sm">
            <p className="font-medium">
              {t("class", { cls: scoped.estimateClass })}
            </p>
            <p className="text-muted-foreground">
              {t("classAccuracy", { low: range.lowPct, high: range.highPct })}
            </p>
          </div>
        </div>
      </Card>

      {whole ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <p className="text-sm text-muted-foreground">
              {t("contingencyHeading")}
            </p>
            <p className="text-xl font-semibold figures">
              {money.format(estimate.recommendedContingency.amount)}
            </p>
            <p className="text-sm text-muted-foreground figures">
              {t("contingencyPct", {
                pct: pct(estimate.recommendedContingency.pct),
                base: money.format(estimate.baseEstimate),
              })}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">
              {t("overrunHeading")}
            </p>
            <p className="text-xl font-semibold figures">
              {t("overrunChance", {
                pct: pct(estimate.overrunRisk.probabilityOfOverrun * 100),
              })}
            </p>
            <p className="text-sm text-muted-foreground figures">
              {t("overrunTypical", {
                pct: pct(estimate.overrunRisk.typicalOverrunPct),
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {estimate.overrunRisk.referenceNote.en}
            </p>
          </Card>
        </div>
      ) : (
        <p className="text-sm">
          {t("shareOfProject", { pct: pct(scoped.component!.share * 100) })}
        </p>
      )}

      {whole && <ComponentBreakdown estimate={estimate} />}

      <MarketEvidenceCard
        estimate={estimate}
        components={components}
        componentId={scoped.component?.componentId ?? null}
        region={region}
      />

      {whole && <DistributionChart distribution={estimate.distribution} />}
      <CategoryBreakdown lineItems={scoped.lineItems} />
      {whole && <DriversTornado drivers={estimate.drivers} />}

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
      <h2 className="text-sm font-medium text-muted-foreground">
        {t("title")}
      </h2>
      <p className="text-3xl font-semibold figures">{money.format(p50)}</p>
      <div
        role="img"
        aria-label={t("range", {
          p10: money.format(p10),
          p90: money.format(p90),
        })}
        className="relative mt-3 h-2 rounded-full bg-primary/20"
      >
        <span
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-primary"
          style={{ left: `${at}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground figures">
        <span>P10 {money.format(p10)}</span>
        <span>P90 {money.format(p90)}</span>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border p-3">{children}</div>;
}
