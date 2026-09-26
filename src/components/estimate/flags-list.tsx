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
import type { Flag } from "@/lib/schemas";

// P3.9b: flags list in the panel, most severe first. A owns the map markers (P3.9a).
// Collapsed by default so it doesn't crowd the panel. Read-only explanations.

const ORDER = { high: 0, warning: 1, info: 2 } as const;
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
  const sorted = [...flags].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );
  const high = sorted.filter((f) => f.severity === "high").length;

  return (
    <Card size="sm">
      <CardContent>
        <Accordion type="single" collapsible>
          <AccordionItem value="flags" className="border-none">
            <AccordionTrigger className="py-0">
              <span className="flex items-center gap-2">
                {t("flags")}
                <Badge variant="secondary">{flags.length}</Badge>
                {high > 0 && (
                  <Badge variant="destructive">
                    {high} {t("severity.high")}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2 pt-3">
              {sorted.map((f) => {
                const Icon = ICON[f.severity];
                const where = names
                  ? f.componentIds.length === 0
                    ? t("projectWide")
                    : f.componentIds.map((id) => names.get(id) ?? id).join(", ")
                  : null;
                return (
                  <Alert
                    key={f.id}
                    variant={f.severity === "high" ? "destructive" : "default"}
                  >
                    <Icon />
                    <AlertTitle className="flex flex-wrap items-center gap-2">
                      {f.title.en}
                      <Badge variant={BADGE[f.severity]}>
                        {t(`severity.${f.severity}`)}
                      </Badge>
                    </AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      <span>{f.explanation.en}</span>
                      {f.costEffect && (
                        <span className="font-medium">{f.costEffect.en}</span>
                      )}
                      {where && <span className="text-xs">{where}</span>}
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
