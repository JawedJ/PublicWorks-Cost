"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ScopedEstimate } from "@/lib/estimate/scope";
import {
  type Estimate,
  type LineItem,
  LineItemCategorySchema,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { NumberInput } from "./number-input";

// P3.10: line items grouped by component, then category. Quantity and unit
// price are editable (overrides); edited cells are marked and can be reset.
// Project-level items (componentId null, e.g. mobilization) are read-only.

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const unitMoney = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});
const qty = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });

type Props = { estimate: Estimate; scoped: ScopedEstimate };

export function LineItemsTab({ estimate, scoped }: Props) {
  const t = useTranslations("lineItems");
  const resetOverrides = useStore((s) => s.resetOverrides);
  const names = new Map(
    estimate.components.map((c) => [c.componentId, c.name]),
  );

  // Component order follows the estimate; project-level items go last.
  const groups = new Map<string | null, LineItem[]>();
  for (const l of scoped.lineItems) {
    groups.set(l.componentId, [...(groups.get(l.componentId) ?? []), l]);
  }
  const order = [
    ...estimate.components
      .map((c) => c.componentId)
      .filter((id) => groups.has(id)),
    ...(groups.has(null) ? [null] : []),
  ];

  if (order.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("empty")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      {order.map((id) => {
        const items = groups.get(id)!;
        const overridden = items.some(
          (l) => l.isQuantityOverridden || l.isPriceOverridden,
        );
        return (
          <Card key={id ?? "project"} size="sm">
            <CardHeader>
              <CardTitle>{id ? names.get(id) : t("projectLevel")}</CardTitle>
              <CardDescription className="tabular-nums">
                {money.format(items.reduce((s, l) => s + l.total, 0))}
              </CardDescription>
              {id && overridden && (
                <CardAction>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetOverrides(id)}
                  >
                    <RotateCcw data-icon="inline-start" />
                    {t("resetAll")}
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader className="sr-only">
                  <TableRow>
                    <TableHead>{t("item")}</TableHead>
                    <TableHead>{t("total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LineItemCategorySchema.options
                    .filter((cat) => items.some((l) => l.category === cat))
                    .map((cat) => (
                      <CategoryRows
                        key={cat}
                        category={cat}
                        items={items.filter((l) => l.category === cat)}
                      />
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CategoryRows({
  category,
  items,
}: {
  category: LineItem["category"];
  items: LineItem[];
}) {
  const t = useTranslations("lineItems");
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={2}
          className="pt-4 text-xs font-medium text-muted-foreground uppercase"
        >
          {t(`categories.${category}`)}
        </TableCell>
      </TableRow>
      {items.map((l) => (
        <Row key={l.id} item={l} />
      ))}
    </>
  );
}

function Row({ item: l }: { item: LineItem }) {
  const t = useTranslations("lineItems");
  const setOverride = useStore((s) => s.setOverride);
  const componentId = l.componentId;
  // Overrides are keyed by the component-local id: line id = `${componentId}:${localId}`.
  const localId = componentId ? l.id.slice(componentId.length + 1) : null;
  const edit =
    componentId && localId
      ? (kind: "quantities" | "unitPrices") => (v: number | null) =>
          setOverride(componentId, kind, localId, v)
      : null;
  const unit = t(`units.${l.unit}`);

  return (
    <TableRow className="align-top">
      <TableCell className="whitespace-normal">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {l.description.en}
            {l.lowConfidence && (
              <Badge variant="secondary">{t("lowConfidence")}</Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {l.quantitySource.en} · {l.unitPriceSource.en}
          </p>
          <div className="flex gap-2">
            <Cell
              label={t("editQuantity", { item: l.description.en })}
              value={l.quantity}
              display={`${qty.format(l.quantity)} ${unit}`}
              overridden={l.isQuantityOverridden}
              onChange={edit?.("quantities")}
            />
            <Cell
              label={t("editUnitPrice", { item: l.description.en })}
              value={round2(l.unitPrice.typical)}
              display={`${unitMoney.format(l.unitPrice.typical)}/${unit}`}
              overridden={l.isPriceOverridden}
              onChange={edit?.("unitPrices")}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {money.format(l.total)}
      </TableCell>
    </TableRow>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function Cell({
  label,
  value,
  display,
  overridden,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  overridden: boolean;
  onChange?: (v: number | null) => void;
}) {
  const t = useTranslations("lineItems");
  if (!onChange) return <span className="text-sm tabular-nums">{display}</span>;
  return (
    <span className="flex w-28 flex-col items-start gap-0.5">
      <NumberInput
        label={label}
        value={value}
        highlighted={overridden}
        onCommit={onChange}
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {display}
      </span>
      {overridden && (
        <Button
          variant="link"
          size="xs"
          className="h-auto px-0"
          onClick={() => onChange(null)}
        >
          {t("reset")}
        </Button>
      )}
    </span>
  );
}
