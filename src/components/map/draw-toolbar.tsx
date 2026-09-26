"use client";

import {
  ChevronDown,
  Circle,
  Lasso,
  MapPin,
  Pentagon,
  Plus,
  Signature,
  Spline,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ALL_TOOLS,
  toolsForTarget,
  type DrawTarget,
  type DrawTool,
} from "@/lib/geo/drawing";
import { holeTarget } from "@/lib/geo/edit";
import parkFeatures from "@/data/park-features.json";
import { templates } from "@/engine/templates";
import type { Component, ComponentType } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";

/** The ellipse tool: a circle icon squashed sideways. */
function EllipseIcon(props: React.ComponentProps<LucideIcon>) {
  return (
    <Circle
      {...props}
      className={cn(props.className, "scale-x-125 scale-y-75")}
    />
  );
}

const toolIcon: Record<DrawTool, LucideIcon | typeof EllipseIcon> = {
  polygon: Pentagon,
  rectangle: Square,
  circle: Circle,
  ellipse: EllipseIcon,
  freehand: Lasso,
  line: Spline,
  freehandLine: Signature,
  point: MapPin,
};

/** Types offered in the Add menu, in order. */
const TYPES: Exclude<ComponentType, "custom">[] = [
  "road",
  "park",
  "building",
  "structure",
];

/** What the Add menu has chosen; turned into a `DrawTarget` against the current selection. */
type Choice =
  | { kind: "new"; type: ComponentType; subtype: string }
  | { kind: "custom" }
  | { kind: "feature"; featureKind: string }
  | { kind: "customFeature" }
  | { kind: "area" }
  | { kind: "planned" }
  | { kind: "section" }
  | { kind: "hole" };

const DEFAULT_CHOICE: Choice = {
  kind: "new",
  type: "road",
  subtype: "road_reconstruction",
};

/** Components that can hold placed features (a park's playground, a building's parking). */
function featureHost(c: Component | undefined) {
  return c?.geometry && (c.type === "park" || c.type === "building")
    ? c
    : undefined;
}

/** The Add menu: pick what to draw (any type and subtype, park features, custom elements), then a shape tool. */
export function DrawToolbar() {
  const t = useTranslations("design.draw");
  const locale = useLocale() as "en" | "fr";
  const components = useStore((s) => s.components);
  const drawing = useStore((s) => s.drawing);
  const drawNotice = useStore((s) => s.drawNotice);
  const selectedSectionId = useStore((s) => s.selectedElement?.sectionId);
  const selectedFeatureId = useStore((s) => s.selectedElement?.featureId);
  const selected = useStore((s) =>
    s.components.find((c) => c.id === s.selectedComponentId),
  );
  const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE);
  const [customName, setCustomName] = useState("");

  const planned = selected?.status === "planned" ? selected : undefined;
  const building =
    selected?.type === "building" && selected.geometry ? selected : undefined;
  const holed = selected && holeTarget(selected) ? selected : undefined;
  const host = featureHost(selected);

  const subtypeLabel = (type: ComponentType, subtype: string) =>
    templates[type].subtypes.find((x) => x.id === subtype)?.label[locale] ??
    subtype;
  const featureLabel = (kind: string) =>
    (
      parkFeatures.features as Record<
        string,
        { label: { en: string; fr: string } }
      >
    )[kind]?.label[locale] ?? kind;
  const name = customName.trim();

  function targetFor(c: Choice): DrawTarget | null {
    switch (c.kind) {
      case "area":
        return { kind: "area" };
      case "planned":
        return planned ? { kind: "planned", componentId: planned.id } : null;
      case "section":
        return building ? { kind: "section", componentId: building.id } : null;
      case "hole":
        return holed
          ? {
              kind: "hole",
              componentId: holed.id,
              sectionId: selectedSectionId,
              featureId: selectedFeatureId,
            }
          : null;
      case "feature":
        return host
          ? {
              kind: "feature",
              componentId: host.id,
              featureKind: c.featureKind,
            }
          : null;
      case "customFeature":
        return host && name
          ? {
              kind: "feature",
              componentId: host.id,
              featureKind: "custom",
              customLabel: name,
            }
          : null;
      case "custom":
        return name
          ? { kind: "new", type: "custom", subtype: "custom", name }
          : null;
      case "new": {
        const n = components.filter((x) => x.subtype === c.subtype).length + 1;
        return {
          kind: "new",
          type: c.type,
          subtype: c.subtype,
          name: t("newName", { type: subtypeLabel(c.type, c.subtype), n }),
        };
      }
    }
  }

  const needsName = choice.kind === "custom" || choice.kind === "customFeature";
  // A contextual choice falls back to a new road when its component is no longer selected.
  const contextual = !needsName && !targetFor(choice);
  const active = contextual ? DEFAULT_CHOICE : choice;
  const target = targetFor(active);
  const tools = toolsForTarget(
    target ?? { kind: "new", type: "custom", subtype: "custom", name: "" },
    components,
  );

  function label(c: Choice): string {
    switch (c.kind) {
      case "area":
        return t("targets.area");
      case "planned":
        return t("targets.planned", { name: planned?.name ?? "" });
      case "section":
        return t("targets.section", { name: building?.name ?? "" });
      case "hole":
        return t("targets.hole", { name: holed?.name ?? "" });
      case "feature":
        return t("targets.feature", {
          feature: featureLabel(c.featureKind),
          name: host?.name ?? "",
        });
      case "customFeature":
        return t("targets.customFeature", { name: host?.name ?? "" });
      case "custom":
        return t("targets.custom");
      case "new":
        return t("targets.new", { type: subtypeLabel(c.type, c.subtype) });
    }
  }

  /** Choosing an item starts drawing it with its first tool (unless it needs a name first). */
  function choose(c: Choice) {
    setChoice(c);
    if (c.kind === "custom" || c.kind === "customFeature") return;
    const tgt = targetFor(c);
    if (!tgt) return;
    const first = toolsForTarget(tgt, components)[0];
    if (first) useStore.getState().startDrawing({ target: tgt, tool: first });
  }

  return (
    <div className="w-fit max-w-[calc(100vw-6rem)] rounded-md border bg-card p-1.5 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(drawing)}
              aria-label={t("whatLabel", { current: label(active) })}
              className="max-w-56"
            >
              <Plus />
              <span className="truncate">{label(active)}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[70vh] overflow-y-auto"
          >
            <DropdownMenuLabel>{t("newComponent")}</DropdownMenuLabel>
            {TYPES.map((type) => (
              <DropdownMenuSub key={type}>
                <DropdownMenuSubTrigger>
                  {t(`types.${type}`)}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {templates[type].subtypes.map((st) => (
                    <DropdownMenuItem
                      key={st.id}
                      onSelect={() =>
                        choose({ kind: "new", type, subtype: st.id })
                      }
                    >
                      {st.label[locale]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
            <DropdownMenuItem onSelect={() => choose({ kind: "custom" })}>
              {t("targets.custom")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => choose({ kind: "area" })}>
              {t("targets.area")}
            </DropdownMenuItem>
            {(planned || building || holed || host) && (
              <DropdownMenuSeparator />
            )}
            {planned && (
              <DropdownMenuItem onSelect={() => choose({ kind: "planned" })}>
                {label({ kind: "planned" })}
              </DropdownMenuItem>
            )}
            {host && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {t("targets.featureMenu", { name: host.name })}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[60vh] overflow-y-auto">
                  {Object.keys(parkFeatures.features).map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      onSelect={() =>
                        choose({ kind: "feature", featureKind: kind })
                      }
                    >
                      {featureLabel(kind)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => choose({ kind: "customFeature" })}
                  >
                    {t("targets.customFeature", { name: host.name })}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {building && (
              <DropdownMenuItem onSelect={() => choose({ kind: "section" })}>
                {label({ kind: "section" })}
              </DropdownMenuItem>
            )}
            {holed && (
              <DropdownMenuItem onSelect={() => choose({ kind: "hole" })}>
                {label({ kind: "hole" })}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {needsName && !drawing && (
          <input
            autoFocus
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={t("customNamePlaceholder")}
            aria-label={t("customNameLabel")}
            className="h-7 w-44 rounded-md border bg-background px-2 text-sm"
          />
        )}
        <div role="group" aria-label={t("toolsLabel")} className="flex">
          {ALL_TOOLS.filter((tool) => tools.includes(tool)).map((tool) => {
            const Icon = toolIcon[tool];
            const on = drawing?.tool === tool;
            return (
              <Button
                key={tool}
                variant={on ? "default" : "ghost"}
                size="icon-sm"
                aria-pressed={on}
                aria-label={t(`tools.${tool}`)}
                title={t(`tools.${tool}`)}
                disabled={!target}
                onClick={() => {
                  const store = useStore.getState();
                  if (on) store.cancelDrawing();
                  else if (drawing)
                    store.startDrawing({ target: drawing.target, tool });
                  else if (target) store.startDrawing({ target, tool });
                }}
              >
                <Icon />
              </Button>
            );
          })}
        </div>
      </div>
      {!drawing && drawNotice && (
        <p
          role="status"
          className="mt-1.5 max-w-72 border-t px-1 pt-1.5 text-xs text-muted-foreground"
        >
          {t(`notices.${drawNotice}`)}
        </p>
      )}
      {drawing && (
        <div
          role="status"
          className="mt-1.5 flex items-start gap-2 border-t px-1 pt-1.5 text-xs text-muted-foreground"
        >
          <p className="max-w-72 flex-1">
            {t(`hints.${drawing.tool}`)} {t("hints.cancel")}
          </p>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("cancel")}
            title={t("cancel")}
            onClick={() => useStore.getState().cancelDrawing()}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
