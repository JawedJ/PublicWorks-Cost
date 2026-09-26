"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      {order.map((id) => {
        const items = groups.get(id)!;
        const overridden = items.some(
          (l) => l.isQuantityOverridden || l.isPriceOverridden,
        );
        return (
          <section key={id ?? "project"} className="flex flex-col gap-2">
            <header className="flex items-center justify-between gap-2">
              <h3 className="font-medium">
                {id ? names.get(id) : t("projectLevel")}
              </h3>
              <span className="flex items-center gap-2 text-sm figures">
                {money.format(items.reduce((s, l) => s + l.total, 0))}
                {id && overridden && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => resetOverrides(id)}
                  >
                    <RotateCcw /> {t("resetAll")}
                  </Button>
                )}
              </span>
            </header>
            {LineItemCategorySchema.options
              .filter((cat) => items.some((l) => l.category === cat))
              .map((cat) => (
                <CategoryTable
                  key={cat}
                  category={cat}
                  items={items.filter((l) => l.category === cat)}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}

function CategoryTable({
  category,
  items,
}: {
  category: LineItem["category"];
  items: LineItem[];
}) {
  const t = useTranslations("lineItems");
  return (
    <table className="w-full text-sm">
      <caption className="pb-1 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t(`categories.${category}`)}
      </caption>
      <thead className="sr-only">
        <tr>
          <th>{t("item")}</th>
          <th>{t("quantity")}</th>
          <th>{t("unitPrice")}</th>
          <th>{t("total")}</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {items.map((l) => (
          <Row key={l.id} item={l} />
        ))}
      </tbody>
    </table>
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
    <tr className="align-top">
      <td className="py-1.5 pr-2">
        <p>
          {l.description.en}
          {l.lowConfidence && (
            <span className="ml-1 rounded bg-warning/20 px-1 text-xs">
              {t("lowConfidence")}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {l.quantitySource.en} · {l.unitPriceSource.en}
        </p>
      </td>
      <td className="w-24 py-1.5 pr-2 text-right">
        <Cell
          label={t("editQuantity", { item: l.description.en })}
          value={l.quantity}
          display={`${qty.format(l.quantity)} ${unit}`}
          overridden={l.isQuantityOverridden}
          onChange={edit?.("quantities")}
        />
      </td>
      <td className="w-24 py-1.5 pr-2 text-right">
        <Cell
          label={t("editUnitPrice", { item: l.description.en })}
          value={round2(l.unitPrice.typical)}
          display={`${unitMoney.format(l.unitPrice.typical)}/${unit}`}
          overridden={l.isPriceOverridden}
          onChange={edit?.("unitPrices")}
        />
      </td>
      <td className="w-24 py-1.5 text-right font-medium figures">
        {money.format(l.total)}
      </td>
    </tr>
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
  if (!onChange) return <span className="figures">{display}</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <NumberInput
        label={label}
        value={value}
        highlighted={overridden}
        onCommit={onChange}
      />
      <span className="text-xs text-muted-foreground figures">{display}</span>
      {overridden && (
        <button
          type="button"
          className="text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => onChange(null)}
        >
          {t("reset")}
        </button>
      )}
    </span>
  );
}
