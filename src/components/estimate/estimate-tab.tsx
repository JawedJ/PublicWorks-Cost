"use client";

import { useTranslations } from "next-intl";
import { CLASS_RANGE } from "@/engine";
import type { ScopedEstimate } from "@/lib/estimate/scope";
import type { Estimate } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// P3.6: Estimate tab. Headline range, class badge with improvement hints,
// contingency and overrun risk (whole project), per-component list, flags.

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = (n: number) => Math.round(n);

type Props = { estimate: Estimate; scoped: ScopedEstimate };

export function EstimateTab({ estimate, scoped }: Props) {
  const t = useTranslations("estimate");
  const selectComponent = useStore((s) => s.selectComponent);
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
        {scoped.hints.length > 0 && (
          <div className="mt-3 text-sm">
            <p className="mb-1 text-muted-foreground">{t("improveHeading")}</p>
            <ul className="flex flex-col gap-1">
              {scoped.hints.slice(0, 5).map((h) => (
                <li key={`${h.componentId}:${h.paramId}`}>
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => selectComponent(h.componentId)}
                  >
                    {h.label.en}
                    {whole && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {names.get(h.componentId)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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

      {whole && (
        <div>
          <h3 className="mb-1 text-sm font-medium">{t("byComponent")}</h3>
          <ul className="flex flex-col divide-y text-sm">
            {estimate.components.map((c) => (
              <li key={c.componentId}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 py-2 text-left hover:bg-muted/50"
                  onClick={() => selectComponent(c.componentId)}
                >
                  <span>{c.name}</span>
                  <span className="figures">
                    {money.format(c.p50)} · {pct(c.share * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {estimate.undrawnComponents > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("undrawn", { count: estimate.undrawnComponents })}
            </p>
          )}
        </div>
      )}

      {scoped.flags.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">{t("flags")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {scoped.flags.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.title.en}</span> —{" "}
                {f.explanation.en}
              </li>
            ))}
          </ul>
        </div>
      )}

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
