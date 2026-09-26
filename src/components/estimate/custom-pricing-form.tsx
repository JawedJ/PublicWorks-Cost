"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
const input =
  "w-full rounded border bg-background px-1.5 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 text-sm">
      <div role="radiogroup" aria-label={t("mode")} className="flex gap-3">
        {(["matched", "own_rate"] as const).map((m) => (
          <label key={m} className="flex items-center gap-1">
            <input
              type="radio"
              name={`mode-${name}`}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {t(`modes.${m}`)}
          </label>
        ))}
      </div>

      {mode === "matched" ? (
        <>
          <select
            aria-label={t("basis")}
            className={input}
            value={matchedId}
            onChange={(e) => pick(e.target.value)}
          >
            <option value="" disabled>
              {t("chooseBasis")}
            </option>
            {GROUPS.map((g) => (
              <optgroup key={g} label={t(`groups.${g}`)}>
                {bases
                  .filter((b) => b.group === g)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label.en} · {money.format(b.typical)}/
                      {unitLabel(b.unit)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {suggestion && suggestion.id !== matchedId && (
            <p className="text-xs">
              {t("suggested")}{" "}
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => pick(suggestion.id)}
              >
                {suggestion.label.en}
              </button>
            </p>
          )}
          {current && (
            <p className="text-xs text-muted-foreground">
              {t("matchedNote", { unit: unitLabel(current.unit) })}
              {current.source && ` ${current.source.en}.`}
            </p>
          )}
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
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
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("rate")}</span>
              <input
                type="number"
                min={0}
                step="any"
                required
                className={input}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("unit")}</span>
              <select
                className={input}
                value={unit}
                onChange={(e) => setUnit(e.target.value as typeof unit)}
              >
                {(["m2", "m", "each", "lump"] as const).map((u) => (
                  <option key={u} value={u}>
                    {t(`perUnit.${u}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("low")}</span>
              <input
                type="number"
                min={0}
                step="any"
                className={input}
                value={low}
                onChange={(e) => setLow(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("high")}</span>
              <input
                type="number"
                min={0}
                step="any"
                className={input}
                value={high}
                onChange={(e) => setHigh(e.target.value)}
              />
            </label>
          </div>
          {!bandValid && (
            <p role="alert" className="text-xs text-destructive">
              {t("bandError")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("ownNote")}</p>
          <Button
            type="submit"
            size="sm"
            className="self-end"
            disabled={!rateValid || !bandValid}
          >
            {t("apply")}
          </Button>
        </form>
      )}
    </div>
  );
}
