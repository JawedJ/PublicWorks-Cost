"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { resolveParams } from "@/engine/params";
import { templates } from "@/engine/templates";
import type {
  Component,
  ParamDefinition,
  ParamSource,
  ParamValue,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { NumberInput } from "./number-input";

// P3.11: parameters per component. Values from the prompt, a document or the site
// get a source badge (defaults and your own edits don't). Scoped to the selected
// component, or all components grouped. Reset returns a value to the default.
// Highest cost impact first.

const BADGE: Record<ParamSource, string> = {
  default: "bg-muted text-muted-foreground",
  user: "bg-primary/15 text-primary",
  ai_prompt: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ai_document: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  site_context: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

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
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-6">
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

  return (
    <section className="flex flex-col gap-2">
      <header>
        {showName && <h3 className="font-medium">{c.name}</h3>}
        {subtype && <p className="text-xs text-muted-foreground">{subtype}</p>}
      </header>
      {defs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {defs.map((d) => (
            <ParamRow key={d.id} component={c} def={d} value={values[d.id]!} />
          ))}
        </ul>
      )}
    </section>
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
  const clearParam = useStore((s) => s.clearComponentParam);
  const meta = c.paramMeta[d.id];
  const source: ParamSource =
    meta?.source ?? (d.id in c.params ? "user" : "default");
  const set = (v: ParamValue) => setParam(c.id, d.id, v);
  const label = d.label.en;

  return (
    <li className="flex flex-col gap-1 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span title={d.why.en}>{label}</span>
        <span className="flex w-40 shrink-0 items-center gap-1">
          {d.type === "number" && (
            <>
              <NumberInput
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
            <select
              aria-label={label}
              className="w-full rounded border bg-background px-1 py-0.5"
              value={String(value)}
              onChange={(e) => set(e.target.value)}
            >
              {d.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label.en}
                </option>
              ))}
            </select>
          )}
          {d.type === "boolean" && (
            <input
              type="checkbox"
              aria-label={label}
              className="ml-auto size-4"
              checked={Boolean(value)}
              onChange={(e) => set(e.target.checked)}
            />
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {/* Only non-obvious sources get a badge (not the default or your own edit). */}
        {source !== "default" && source !== "user" && (
          <span
            className={`rounded px-1.5 py-0.5 ${BADGE[source]}`}
            title={meta?.evidence}
          >
            {t(`sources.${source}`)}
          </span>
        )}
        {meta?.evidence && (
          <span className="truncate text-muted-foreground">
            “{meta.evidence}”
          </span>
        )}
        {source !== "default" && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            onClick={() => clearParam(c.id, d.id)}
          >
            <RotateCcw className="size-3" /> {t("reset")}
          </button>
        )}
      </div>
    </li>
  );
}
