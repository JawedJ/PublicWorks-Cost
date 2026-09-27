"use client";

import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { groupFlags } from "@/lib/estimate/group-flags";
import type { Flag } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";

// P3.9b: flags list in the panel, most severe first. Collapsed by default so it
// doesn't crowd the panel. The same issue on several components is one entry
// listing each of them. Clicking an entry (or one of its rows) highlights the
// components it applies to, and the issue itself, on the map; again to clear.

const ICON = { high: OctagonAlert, warning: TriangleAlert, info: Info };
const BADGE = {
  high: "destructive",
  warning: "secondary",
  info: "outline",
} as const;

type Props = {
  flags: Flag[];
  /** componentId → name; names are shown only for the whole project. */
  names?: Map<string, string>;
};

export function FlagsList({ flags, names }: Props) {
  const t = useTranslations("estimate");
  const focus = useStore((s) => s.flagFocus);
  const setFocus = useStore((s) => s.setFlagFocus);
  if (flags.length === 0) return null;
  /** Highlight these components for this issue, or clear if already shown. */
  const toggle = (key: string, code: string, componentIds: string[]) =>
    setFocus(
      focus?.key === key || componentIds.length === 0
        ? null
        : { key, code, componentIds },
    );
  const clickable = (
    key: string,
    code: string,
    componentIds: string[],
  ): React.HTMLAttributes<HTMLElement> =>
    componentIds.length === 0
      ? {}
      : {
          role: "button",
          tabIndex: 0,
          title: t("flagShowOnMap"),
          "aria-pressed": focus?.key === key,
          onClick: (e) => {
            e.stopPropagation();
            toggle(key, code, componentIds);
          },
          onKeyDown: (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            toggle(key, code, componentIds);
          },
        };
  const groups = groupFlags(flags);
  const high = groups.filter((g) => g.severity === "high").length;
  const nameList = (ids: string[]) =>
    ids.length === 0
      ? t("projectWide")
      : ids.map((id) => names?.get(id) ?? id).join(", ");

  return (
    <Card size="sm">
      <CardContent>
        <Accordion type="single" collapsible>
          <AccordionItem value="flags" className="border-none">
            <AccordionTrigger className="py-0">
              <span className="flex items-center gap-2">
                {t("flags")}
                <Badge variant="secondary">{groups.length}</Badge>
                {high > 0 && (
                  <Badge variant="destructive">
                    {high} {t("severity.high")}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2 pt-3">
              {groups.map((g) => {
                const Icon = ICON[g.severity];
                const listed =
                  g.items.length > 1 || g.items.some((i) => i.detail);
                const all = [
                  ...new Set(g.items.flatMap((i) => i.componentIds)),
                ];
                return (
                  <Alert
                    key={g.id}
                    variant={g.severity === "high" ? "destructive" : "default"}
                    {...clickable(g.id, g.code, all)}
                    className={cn(
                      all.length > 0 &&
                        "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      focus?.key === g.id && "ring-2 ring-amber-400",
                    )}
                  >
                    <Icon />
                    <AlertTitle className="flex flex-wrap items-center gap-2">
                      {g.title}
                      <Badge variant={BADGE[g.severity]}>
                        {t(`severity.${g.severity}`)}
                      </Badge>
                      {g.items.length > 1 && (
                        <Badge variant="outline">
                          {t("flagCount", { count: g.items.length })}
                        </Badge>
                      )}
                    </AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      {g.explanation && <span>{g.explanation}</span>}
                      {g.costEffect && (
                        <span className="font-medium">{g.costEffect}</span>
                      )}
                      {listed ? (
                        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs">
                          {g.items.map((i, n) => (
                            <li
                              key={n}
                              {...clickable(
                                `${g.id}:${n}`,
                                g.code,
                                i.componentIds,
                              )}
                              className={cn(
                                i.componentIds.length > 0 &&
                                  "cursor-pointer rounded-sm hover:underline",
                                focus?.key === `${g.id}:${n}` &&
                                  "font-medium text-amber-300",
                              )}
                            >
                              {names && (
                                <span className="font-medium">
                                  {nameList(i.componentIds)}
                                  {(i.detail || i.costEffect) && ": "}
                                </span>
                              )}
                              {[i.detail, i.costEffect]
                                .filter(Boolean)
                                .join(" ")}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        names && (
                          <span className="text-xs">
                            {nameList(g.items[0]!.componentIds)}
                          </span>
                        )
                      )}
                    </AlertDescription>
                  </Alert>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
