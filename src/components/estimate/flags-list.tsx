"use client";

import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Flag } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// P3.9b: flags list in the panel, most severe first. A owns the map markers (P3.9a).
// Clicking a flag that names one component scopes the panel to it.

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
  const selectComponent = useStore((s) => s.selectComponent);
  if (flags.length === 0) return null;
  const sorted = [...flags].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">
        {t("flags")}{" "}
        <span className="text-muted-foreground">({flags.length})</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {sorted.map((f) => {
          const target =
            f.componentIds.length === 1 ? f.componentIds[0]! : null;
          const where = names
            ? f.componentIds.length === 0
              ? t("projectWide")
              : f.componentIds.map((id) => names.get(id) ?? id).join(", ")
            : null;
          const body = (
            <>
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
            </>
          );
          const cls =
            "flex w-full gap-2 rounded-md border p-2 text-left text-sm";
          return (
            <li key={f.id}>
              {names && target ? (
                <button
                  type="button"
                  className={`${cls} hover:bg-muted/50`}
                  onClick={() => selectComponent(target)}
                >
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
