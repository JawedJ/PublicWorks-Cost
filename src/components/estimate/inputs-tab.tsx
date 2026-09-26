"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { resolveParams } from "@/engine/params";
import { templates } from "@/engine/templates";
import type {
  Component,
  ParamDefinition,
  ParamSource,
  ParamValue,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { CustomPricingForm } from "./custom-pricing-form";
import { NumberInput } from "./number-input";

// P3.11: parameters per component. Values from the prompt, a document or the site
// get a source badge (defaults and your own edits don't). Scoped to the selected
// component, or all components grouped. Reset returns a value to the default.
// Highest cost impact first.

type Props = {
  /** All design components (from the store). */
  components: Component[];
  /** Scope: one component, or null for all. */
  componentId: string | null;
};

export function InputsTab({ components: all, componentId }: Props) {
  const t = useTranslations("inputs");
  const components = componentId
    ? all.filter((c) => c.id === componentId)
    : all;

  if (components.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("empty")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-4">
      {components.map((c) => (
        <ComponentInputs key={c.id} component={c} showName={!componentId} />
      ))}
    </div>
  );
}

function ComponentInputs({
  component: c,
  showName,
}: {
  component: Component;
  showName: boolean;
}) {
  const t = useTranslations("inputs");
  const tpl = templates[c.type];
  const values = resolveParams(tpl, c.subtype, c.params);
  const defs = [...tpl.paramCatalog].sort(
    (a, b) => b.costImpact - a.costImpact,
  );
  const subtype = tpl.subtypes.find((s) => s.id === c.subtype)?.label.en;
  const updateComponent = useStore((s) => s.updateComponent);
  // Custom park features are priced like custom components (SPEC 6.5).
  const customFeatures =
    c.geometry?.features.filter((f) => f.kind === "custom") ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        {showName && <CardTitle>{c.name}</CardTitle>}
        {subtype && <CardDescription>{subtype}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {c.type === "custom" ? (
          <CustomPricingForm
            name={c.name}
            pricing={c.customPricing}
            onChange={(customPricing) =>
              updateComponent(c.id, { customPricing })
            }
          />
        ) : defs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <FieldGroup>
            {defs.map((d) => (
              <ParamRow
                key={d.id}
                component={c}
                def={d}
                value={values[d.id]!}
              />
            ))}
          </FieldGroup>
        )}
        {customFeatures.map((f) => (
          <FieldSet key={f.id}>
            <FieldLegend variant="label">
              {f.customLabel ?? t("customFeature")}
            </FieldLegend>
            <CustomPricingForm
              name={f.customLabel ?? ""}
              pricing={f.customPricing}
              onChange={(customPricing) =>
                c.geometry &&
                updateComponent(c.id, {
                  geometry: {
                    ...c.geometry,
                    features: c.geometry.features.map((x) =>
                      x.id === f.id ? { ...x, customPricing } : x,
                    ),
                  },
                })
              }
            />
          </FieldSet>
        ))}
      </CardContent>
    </Card>
  );
}

function ParamRow({
  component: c,
  def: d,
  value,
}: {
  component: Component;
  def: ParamDefinition;
  value: ParamValue;
}) {
  const t = useTranslations("inputs");
  const setParam = useStore((s) => s.setComponentParam);
  const meta = c.paramMeta[d.id];
  const source: ParamSource =
    meta?.source ?? (d.id in c.params ? "user" : "default");
  const set = (v: ParamValue) => setParam(c.id, d.id, v);
  const label = d.label.en;

  const id = `${c.id}-${d.id}`;
  const shown = source !== "default" && source !== "user";

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {(shown || meta?.evidence) && (
          <FieldDescription className="flex flex-wrap items-center gap-1.5">
            {/* Only non-obvious sources get a badge (not the default or your own edit). */}
            {shown && (
              <Badge variant="secondary">{t(`sources.${source}`)}</Badge>
            )}
            {meta?.evidence && (
              <span className="truncate">“{meta.evidence}”</span>
            )}
          </FieldDescription>
        )}
      </FieldContent>
      <div className="flex w-40 shrink-0 items-center justify-end gap-1.5">
        {d.type === "number" && (
          <>
            <NumberInput
              id={id}
              label={label}
              value={Number(value)}
              min={d.min ?? 0}
              max={d.max}
              onCommit={set}
            />
            {d.unit && (
              <span className="text-xs text-muted-foreground">{d.unit}</span>
            )}
          </>
        )}
        {d.type === "enum" && (
          <Select value={String(value)} onValueChange={set}>
            <SelectTrigger id={id} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {d.options?.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label.en}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {d.type === "boolean" && (
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={(v) => set(v)}
          />
        )}
      </div>
    </Field>
  );
}
