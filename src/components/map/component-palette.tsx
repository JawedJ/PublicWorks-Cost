"use client";

import {
  Bridge,
  Building2,
  ChevronRight,
  Route,
  Trees,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { templates } from "@/engine/templates";
import { toolsForTarget } from "@/lib/geo/drawing";
import type { ComponentType } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";

const TYPES: { type: Exclude<ComponentType, "custom">; icon: LucideIcon }[] = [
  { type: "road", icon: Route },
  { type: "park", icon: Trees },
  { type: "building", icon: Building2 },
  { type: "structure", icon: Bridge },
];

/**
 * Component types to add: choosing one starts drawing it (like the Add menu),
 * so the next click on the map begins the shape. Choosing it again cancels.
 */
export function ComponentPalette() {
  const t = useTranslations("design.draw");
  const tPalette = useTranslations("design.palette");
  const locale = useLocale() as "en" | "fr";
  const drawing = useStore((s) => s.drawing);
  const armed =
    drawing?.target.kind === "new" ? drawing.target.subtype : undefined;

  function choose(type: Exclude<ComponentType, "custom">, subtype: string) {
    const store = useStore.getState();
    if (armed === subtype) return store.cancelDrawing();
    const label =
      templates[type].subtypes.find((x) => x.id === subtype)?.label[locale] ??
      subtype;
    const n = store.components.filter((c) => c.subtype === subtype).length + 1;
    const target = {
      kind: "new" as const,
      type,
      subtype,
      name: t("newName", { type: label, n }),
    };
    const tool = toolsForTarget(target, store.components)[0];
    if (tool) store.startDrawing({ target, tool });
  }

  return (
    <section
      aria-label={tPalette("title")}
      className="border-t"
    >
      <h3 className="px-3 pt-2 text-xs font-semibold">{tPalette("title")}</h3>
      <p className="px-3 pb-1 text-xs text-muted-foreground">
        {tPalette("hint")}
      </p>
      {TYPES.map(({ type, icon: Icon }) => (
        <details key={type} className="group/type px-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 py-1 text-sm hover:bg-accent">
            <ChevronRight className="size-3.5 transition-transform group-open/type:rotate-90" />
            <Icon aria-hidden className="size-4" />
            {t(`types.${type}`)}
          </summary>
          <ul className="flex flex-wrap gap-1 pb-2 pl-6">
            {templates[type].subtypes.map((st) => (
              <li key={st.id}>
                <button
                  type="button"
                  aria-pressed={armed === st.id}
                  onClick={() => choose(type, st.id)}
                  title={tPalette("pick", { type: st.label[locale] })}
                  className={cn(
                    "rounded-md border bg-background px-2 py-0.5 text-xs shadow-xs hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    armed === st.id &&
                      "border-primary bg-primary text-primary-foreground hover:border-primary",
                  )}
                >
                  {st.label[locale]}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
