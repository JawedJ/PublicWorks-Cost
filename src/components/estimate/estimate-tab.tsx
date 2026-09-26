"use client";

import { CalendarClock, ShieldCheck, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CLASS_RANGE } from "@/engine";
import { cn } from "@/lib/utils";
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

// P3.6: Estimate tab. Headline range with class, contingency and overrun risk,
// breakdowns and charts, market evidence, flags. Built from shadcn Card/Badge.

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = (n: number) => Math.round(n);

type Level = "low" | "moderate" | "high";
/** Contingency as % of base: under 10% is low, 20% and over is high. */
const contingencyLevel = (p: number): Level =>
  p < 10 ? "low" : p < 20 ? "moderate" : "high";
/** Typical overrun size (the chance of some overrun is high for almost every project). */
const overrunLevel = (p: number): Level =>
  p < 5 ? "low" : p < 15 ? "moderate" : "high";
const LEVEL_TEXT: Record<Level, string> = {
  low: "text-chart-3",
  moderate: "text-warning",
  high: "text-destructive",
};
const LEVEL_BADGE: Record<Level, string> = {
  low: "bg-chart-3/15 text-chart-3",
  moderate: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

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
  const contingency = contingencyLevel(estimate.recommendedContingency.pct);
  const overrun = overrunLevel(estimate.overrunRisk.typicalOverrunPct);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription>{t("title")}</CardDescription>
          <CardTitle className="text-4xl tabular-nums">
            {money.format(scoped.p50)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <RangeBar p10={scoped.p10} p50={scoped.p50} p90={scoped.p90} />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>P10 {money.format(scoped.p10)}</span>
            <span>P90 {money.format(scoped.p90)}</span>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Badge>{t("class", { cls: scoped.estimateClass })}</Badge>
          <Badge variant="secondary">
            {t("classAccuracy", {
              low: range.lowPct,
              high: range.highPct,
            })}
          </Badge>
          {!whole && (
            <Badge variant="outline">
              {t("shareOfProject", {
                pct: pct(scoped.component!.share * 100),
              })}
            </Badge>
          )}
        </CardFooter>
      </Card>

      {whole && (
        <div className="grid grid-cols-2 gap-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <ShieldCheck />
                {t("contingencyHeading")}
              </CardDescription>
              <CardTitle
                className={cn("text-2xl tabular-nums", LEVEL_TEXT[contingency])}
              >
                {money.format(estimate.recommendedContingency.amount)}
              </CardTitle>
              <CardAction>
                <LevelBadge level={contingency} />
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t("contingencyPct", {
                pct: pct(estimate.recommendedContingency.pct),
                base: money.format(estimate.baseEstimate),
              })}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <TrendingUp />
                {t("overrunHeading")}
              </CardDescription>
              <CardTitle
                className={cn("text-2xl tabular-nums", LEVEL_TEXT[overrun])}
              >
                {pct(estimate.overrunRisk.probabilityOfOverrun * 100)}%
              </CardTitle>
              <CardAction>
                <LevelBadge level={overrun} />
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t("overrunTypical", {
                pct: pct(estimate.overrunRisk.typicalOverrunPct),
              })}
            </CardContent>
          </Card>
        </div>
      )}

      <DurationCard
        estimate={estimate}
        componentId={scoped.component?.componentId ?? null}
      />

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

function LevelBadge({ level }: { level: Level }) {
  const t = useTranslations("estimate");
  return (
    <Badge variant="outline" className={cn("border-none", LEVEL_BADGE[level])}>
      {t(`level.${level}`)}
    </Badge>
  );
}

/** Construction time from real contract durations (whole project or one component). */
function DurationCard({
  estimate,
  componentId,
}: {
  estimate: Estimate;
  componentId: string | null;
}) {
  const t = useTranslations("estimate");
  const s = estimate.schedule;
  const comp = componentId
    ? estimate.components.find((c) => c.componentId === componentId)
    : null;
  const months = comp ? comp.durationMonths : s?.months;
  if (!s || !months) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <CalendarClock />
          {t("durationHeading")}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {t("durationMonths", { months: Math.round(months) })}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
        {!comp && (
          <span>
            {t("durationRange", {
              low: Math.round(s.p10Months),
              high: Math.round(s.p90Months),
            })}
          </span>
        )}
        <span className="text-xs">{s.source.en}.</span>
      </CardContent>
    </Card>
  );
}

/** P10–P90 bar with the P50 marked. */
function RangeBar({
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
    <div
      role="img"
      aria-label={t("range", {
        p10: money.format(p10),
        p90: money.format(p90),
      })}
      className="relative h-2 rounded-full bg-muted"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary/40"
        style={{ width: `${at}%` }}
      />
      <span
        className="absolute top-1/2 size-4 -translate-1/2 rounded-full border-2 border-background bg-primary"
        style={{ left: `${at}%` }}
      />
    </div>
  );
}
