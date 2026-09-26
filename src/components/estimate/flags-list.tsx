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

// P3.9b: flags list in the panel, most severe first. A owns the map markers (P3.9a).
// Collapsed by default so it doesn't crowd the panel. Read-only explanations.
// The same issue on several components is one entry listing each of them.

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
  if (flags.length === 0) return null;
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
                return (
                  <Alert
                    key={g.id}
                    variant={g.severity === "high" ? "destructive" : "default"}
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
                            <li key={n}>
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
