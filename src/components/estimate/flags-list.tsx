"use client";

import { ChevronRight, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Flag } from "@/lib/schemas";

// P3.9b: flags list in the panel, most severe first. A owns the map markers (P3.9a).
// Collapsed by default and scrollable when open, so it doesn't crowd the panel.
// Flags are read-only explanations: no click action.

const ORDER = { high: 0, warning: 1, info: 2 } as const;
const ICON = {
  high: <OctagonAlert className="size-4 text-destructive" />,
  warning: <TriangleAlert className="size-4 text-warning" />,
  info: <Info className="size-4 text-muted-foreground" />,
};

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

  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
        {ICON[sorted[0]!.severity]}
        {t("flags")}
        <span className="text-muted-foreground">({flags.length})</span>
      </summary>
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto border-t p-2">
        {sorted.map((f) => {
          const where = names
            ? f.componentIds.length === 0
              ? t("projectWide")
              : f.componentIds.map((id) => names.get(id) ?? id).join(", ")
            : null;
          return (
            <li key={f.id} className="flex gap-2 rounded-md border p-2 text-sm">
              <span className="mt-0.5 shrink-0">{ICON[f.severity]}</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">
                  <span className="sr-only">
                    {t(`severity.${f.severity}`)}:{" "}
                  </span>
                  {f.title.en}
                </span>
                <span className="text-muted-foreground">
                  {f.explanation.en}
                </span>
                {f.costEffect && <span>{f.costEffect.en}</span>}
                {where && (
                  <span className="text-xs text-muted-foreground">{where}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
