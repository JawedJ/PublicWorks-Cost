"use client";

import { ChevronRight, Flag as FlagIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Flag } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { SEVERITY_STYLE, SeverityPill } from "./panel-ui";

// P3.9b: flags list in the panel, most severe first. A owns the map markers (P3.9a).
// Collapsed by default and scrollable when open, so it doesn't crowd the panel.
// Flags are read-only explanations: no click action.

const ORDER = { high: 0, warning: 1, info: 2 } as const;

type Props = {
  flags: Flag[];
  /** componentId → name; names are shown only for the whole project. */
  names?: Map<string, string>;
};

export function FlagsList({ flags, names }: Props) {
  const t = useTranslations("estimate");
  if (flags.length === 0) return null;
  const sorted = [...flags].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );

  const counts = (["high", "warning", "info"] as const)
    .map(
      (sev) => [sev, sorted.filter((f) => f.severity === sev).length] as const,
    )
    .filter(([, n]) => n > 0);

  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-medium [&::-webkit-details-marker]:hidden">
        <FlagIcon aria-hidden className="size-4 opacity-80" />
        {t("flags")}
        <span className="grid size-5 place-items-center rounded-full bg-secondary text-[11px] figures">
          {flags.length}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {counts.map(([sev, n]) => (
            <SeverityPill key={sev} severity={sev}>
              {n}
            </SeverityPill>
          ))}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {sorted.map((f) => {
          const where = names
            ? f.componentIds.length === 0
              ? t("projectWide")
              : f.componentIds.map((id) => names.get(id) ?? id).join(", ")
            : null;
          const Icon = SEVERITY_STYLE[f.severity].icon;
          return (
            <li
              key={f.id}
              className={cn(
                "flex flex-col gap-1 rounded-xl border-l-2 p-3 text-sm",
                SEVERITY_STYLE[f.severity].row,
              )}
            >
              <span className="flex flex-wrap items-center gap-2 font-medium">
                <Icon aria-hidden className="size-4 shrink-0 opacity-80" />
                {f.title.en}
                <SeverityPill severity={f.severity}>
                  {t(`severity.${f.severity}`)}
                </SeverityPill>
              </span>
              <span className="text-muted-foreground">{f.explanation.en}</span>
              {f.costEffect && (
                <span className="text-xs font-medium">{f.costEffect.en}</span>
              )}
              {where && (
                <span className="text-xs text-muted-foreground">{where}</span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
