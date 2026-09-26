"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ComponentType, Estimate, LineItem } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// P3.8: estimate visuals with shadcn Chart (Recharts): per-component breakdown,
// cost distribution, category breakdown, per-unit metrics.

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

/** Component colour by type, so all buildings (or roads…) share a colour. */
export const TYPE_COLOR: Record<ComponentType, string> = {
  road: "var(--chart-1)",
  building: "var(--chart-2)",
  park: "var(--chart-3)",
  structure: "var(--chart-4)",
  parking: "var(--chart-5)",
  custom: "var(--muted-foreground)",
};

const formatMoney = (v: unknown) => compact.format(Number(v));

/** Horizontal bars of component P50, plus a list that scopes the panel on click. */
export function ComponentBreakdown({ estimate }: { estimate: Estimate }) {
  const t = useTranslations("charts");
  const tEst = useTranslations("estimate");
  const tType = useTranslations("buildList.types");
  const selectComponent = useStore((s) => s.selectComponent);
  const data = estimate.components.map((c) => ({
    name: c.name,
    p50: c.p50,
    type: c.type,
  }));
  const types = [...new Set(estimate.components.map((c) => c.type))];
  const config = { p50: { label: "P50" } } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("byComponent")}</CardTitle>
        <CardDescription>{t("byComponentLabel")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ChartContainer
          config={config}
          className="w-full"
          style={{ height: Math.max(120, data.length * 36) }}
        >
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 8 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) =>
                v.length > 16 ? `${v.slice(0, 15)}…` : v
              }
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={formatMoney} />}
            />
            <Bar dataKey="p50" radius={6}>
              {data.map((d, i) => (
                <Cell key={i} fill={TYPE_COLOR[d.type]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <ul
          aria-label={t("legend")}
          className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground"
        >
          {types.map((type) => (
            <li key={type} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: TYPE_COLOR[type] }}
              />
              {tType(type)}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col">
          {estimate.components.map((c) => (
            <li key={c.componentId}>
              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => selectComponent(c.componentId)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: TYPE_COLOR[c.type] }}
                  />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {compact.format(c.p50)} · {Math.round(c.share * 100)}%
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {estimate.undrawnComponents > 0 && (
          <p className="text-sm text-muted-foreground">
            {tEst("undrawn", { count: estimate.undrawnComponents })}
          </p>
        )}
      </CardContent>
    </Card>
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
  const width = bins[1]!.bin - bins[0]!.bin;
  const data = bins.map((b) => ({ x: b.bin + width / 2, count: b.count }));
  const config = {
    count: { label: t("outcomes"), color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("distribution")}</CardTitle>
        <CardDescription>{t("distributionNote")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          className="aspect-[2/1] w-full"
          aria-label={t("distributionLabel", {
            p10: compact.format(d.p10),
            p50: compact.format(d.p50),
            p90: compact.format(d.p90),
          })}
        >
          <BarChart accessibilityLayer data={data} barCategoryGap={1}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatMoney}
              tickCount={4}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) =>
                    compact.format(Number(p?.[0]?.payload?.x ?? 0))
                  }
                />
              }
            />
            <Bar dataKey="count" fill="var(--color-count)" radius={2} />
            {(
              [
                ["P10", d.p10],
                ["P50", d.p50],
                ["P90", d.p90],
              ] as const
            ).map(([label, v]) => (
              <ReferenceLine
                key={label}
                x={v}
                stroke={
                  label === "P50" ? "var(--primary)" : "var(--muted-foreground)"
                }
                strokeDasharray={label === "P50" ? undefined : "4 4"}
                label={{
                  value: label,
                  position: "top",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Direct cost by category for the scoped line items, largest first. */
export function CategoryBreakdown({ lineItems }: { lineItems: LineItem[] }) {
  const t = useTranslations("charts");
  const tCat = useTranslations("lineItems.categories");
  const totals = new Map<LineItem["category"], number>();
  for (const l of lineItems)
    totals.set(l.category, (totals.get(l.category) ?? 0) + l.total);
  const data = [...totals]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, total]) => ({ name: tCat(cat), total }));
  if (data.length === 0) return null;
  const config = {
    total: { label: t("cost"), color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("byCategory")}</CardTitle>
        <CardDescription>{t("byCategoryNote")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          className="w-full"
          style={{ height: Math.max(120, data.length * 32) }}
        >
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 8 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={formatMoney} />}
            />
            <Bar dataKey="total" fill="var(--color-total)" radius={6} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Whole-project cost per unit of what was drawn. */
export function PerUnitMetrics({
  metrics,
}: {
  metrics: Estimate["perUnitMetrics"];
}) {
  const t = useTranslations("charts");
  const rows = (
    [
      ["perM", metrics.perM],
      ["perM2", metrics.perM2],
      ["perM2GFA", metrics.perM2GFA],
    ] as const
  ).filter(([, v]) => v !== undefined);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("perUnit")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        {rows.map(([id, v]) => (
          <div key={id} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t(`units.${id}`)}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {money.format(v!)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
