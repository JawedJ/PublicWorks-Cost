"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { refData } from "@/data";
import { customBases, suggestBasis } from "@/engine/templates/custom";
import type { CustomPricing } from "@/lib/schemas";

// B.3 (SPEC 6.5): how a custom element is priced. "Matched" picks a known cost
// (real Altus building rates, park features, unit prices), with a suggestion
// from the name; "Own rate" is the user's rate with optional low/high.

const bases = customBases(refData);
const GROUPS = ["building", "park", "unit_price"] as const;
const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

type Props = {
  /** Element name, used for the suggestion. */
  name: string;
  pricing: CustomPricing | undefined;
  onChange: (pricing: CustomPricing) => void;
};

export function CustomPricingForm({ name, pricing, onChange }: Props) {
  const t = useTranslations("customPricing");
  const suggestion = useMemo(() => suggestBasis(name, bases), [name]);
  const [mode, setMode] = useState<CustomPricing["mode"]>(
    pricing?.mode ?? "matched",
  );
  const own = pricing?.mode === "own_rate" ? pricing : undefined;
  const [unit, setUnit] = useState(own?.unit ?? "m2");
  const [rate, setRate] = useState(own ? String(own.rate) : "");
  const [low, setLow] = useState(own?.low !== undefined ? String(own.low) : "");
  const [high, setHigh] = useState(
    own?.high !== undefined ? String(own.high) : "",
  );

  const matchedId = pricing?.mode === "matched" ? pricing.basisId : "";
  const current = bases.find((b) => b.id === matchedId);
  const unitLabel = (u: "m" | "m2" | "each") => t(`units.${u}`);
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const rateValid = num(rate) !== undefined && Number(rate) >= 0;
  const lowV = num(low);
  const highV = num(high);
  const bandValid =
    (lowV === undefined || (lowV >= 0 && lowV <= Number(rate))) &&
    (highV === undefined || highV >= Number(rate));

  function pick(id: string) {
    const b = bases.find((x) => x.id === id);
    if (b)
      onChange({
        mode: "matched",
        basisId: b.id,
        unit: b.unit,
        suggestedByAi: false,
      });
  }

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label={t("mode")}
        value={mode}
        onValueChange={(v) => v && setMode(v as CustomPricing["mode"])}
      >
        <ToggleGroupItem value="matched">{t("modes.matched")}</ToggleGroupItem>
        <ToggleGroupItem value="own_rate">
          {t("modes.own_rate")}
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "matched" ? (
        <Field>
          <FieldLabel>{t("basis")}</FieldLabel>
          <Select value={matchedId || undefined} onValueChange={pick}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("chooseBasis")} />
            </SelectTrigger>
            <SelectContent>
              {GROUPS.map((g) => (
                <SelectGroup key={g}>
                  <SelectLabel>{t(`groups.${g}`)}</SelectLabel>
                  {bases
                    .filter((b) => b.group === g)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label.en} · {money.format(b.typical)}/
                        {unitLabel(b.unit)}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {suggestion && suggestion.id !== matchedId && (
            <FieldDescription>
              {t("suggested")}{" "}
              <Button
                variant="link"
                size="xs"
                className="h-auto px-0"
                onClick={() => pick(suggestion.id)}
              >
                {suggestion.label.en}
              </Button>
            </FieldDescription>
          )}
          {current && (
            <FieldDescription>
              {t("matchedNote", { unit: unitLabel(current.unit) })}
              {current.source && ` ${current.source.en}.`}
            </FieldDescription>
          )}
        </Field>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rateValid || !bandValid) return;
            onChange({
              mode: "own_rate",
              unit,
              rate: Number(rate),
              ...(lowV !== undefined && { low: lowV }),
              ...(highV !== undefined && { high: highV }),
            });
          }}
        >
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`${name}-rate`}>{t("rate")}</FieldLabel>
                <Input
                  id={`${name}-rate`}
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t("unit")}</FieldLabel>
                <Select
                  value={unit}
                  onValueChange={(v) => setUnit(v as typeof unit)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(["m2", "m", "each", "lump"] as const).map((u) => (
                        <SelectItem key={u} value={u}>
                          {t(`perUnit.${u}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!bandValid || undefined}>
                <FieldLabel htmlFor={`${name}-low`}>{t("low")}</FieldLabel>
                <Input
                  id={`${name}-low`}
                  type="number"
                  min={0}
                  step="any"
                  aria-invalid={!bandValid || undefined}
                  value={low}
                  onChange={(e) => setLow(e.target.value)}
                />
              </Field>
              <Field data-invalid={!bandValid || undefined}>
                <FieldLabel htmlFor={`${name}-high`}>{t("high")}</FieldLabel>
                <Input
                  id={`${name}-high`}
                  type="number"
                  min={0}
                  step="any"
                  aria-invalid={!bandValid || undefined}
                  value={high}
                  onChange={(e) => setHigh(e.target.value)}
                />
              </Field>
            </div>
            {!bandValid && <FieldError>{t("bandError")}</FieldError>}
            <FieldDescription>{t("ownNote")}</FieldDescription>
            <Button
              type="submit"
              size="sm"
              className="self-end"
              disabled={!rateValid || !bandValid}
            >
              {t("apply")}
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
