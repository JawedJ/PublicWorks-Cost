"use client";

import {
  ChevronDown,
  Circle,
  Lasso,
  MapPin,
  Pentagon,
  Signature,
  Spline,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ALL_TOOLS,
  toolsForTarget,
  type DrawTarget,
  type DrawTool,
} from "@/lib/geo/drawing";
import type { ComponentType } from "@/lib/schemas";
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

/** Component types that can be drawn from the toolbar, with their starting subtype. The Add menu (P1.6) offers every subtype. */
const NEW_TYPES: { type: ComponentType; subtype: string }[] = [
  { type: "road", subtype: "road_reconstruction" },
  { type: "park", subtype: "neighbourhood_park" },
  { type: "building", subtype: "community_centre" },
  { type: "structure", subtype: "culvert_replacement" },
];

type TargetKey = ComponentType | "area" | "planned" | "section";

/** Pick what to draw, then a shape tool. Shows a hint and Cancel while drawing. */
export function DrawToolbar() {
  const t = useTranslations("design.draw");
  const tTypes = useTranslations("design.components.types");
  const components = useStore((s) => s.components);
  const drawing = useStore((s) => s.drawing);
  const selected = useStore((s) =>
    s.components.find((c) => c.id === s.selectedComponentId),
  );
  const [key, setKey] = useState<TargetKey>("road");

  const planned = selected?.status === "planned" ? selected : undefined;
  const building =
    selected?.type === "building" && selected.geometry ? selected : undefined;

  function targetFor(k: TargetKey): DrawTarget | null {
    if (k === "area") return { kind: "area" };
    if (k === "planned")
      return planned ? { kind: "planned", componentId: planned.id } : null;
    if (k === "section")
      return building ? { kind: "section", componentId: building.id } : null;
    const def = NEW_TYPES.find((x) => x.type === k);
    if (!def) return null;
    const n = components.filter((c) => c.type === k).length + 1;
    return {
      kind: "new",
      type: def.type,
      subtype: def.subtype,
      name: t("newName", { type: tTypes(def.type), n }),
    };
  }

  // A contextual choice falls back to a road when its component is no longer selected.
  const activeKey: TargetKey = targetFor(key) ? key : "road";
  const target = targetFor(activeKey)!;
  const tools = toolsForTarget(target, components);

  const label = (k: TargetKey) =>
    k === "area"
      ? t("targets.area")
      : k === "planned"
        ? t("targets.planned", { name: planned?.name ?? "" })
        : k === "section"
          ? t("targets.section", { name: building?.name ?? "" })
          : t("targets.new", { type: tTypes(k) });

  return (
    <div className="w-fit max-w-[calc(100vw-6rem)] rounded-md border bg-card p-1.5 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(drawing)}
              aria-label={t("whatLabel", { current: label(activeKey) })}
              className="max-w-56"
            >
              <span className="truncate">{label(activeKey)}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={activeKey}
              onValueChange={(v) => setKey(v as TargetKey)}
            >
              <DropdownMenuLabel>{t("newComponent")}</DropdownMenuLabel>
              {NEW_TYPES.map(({ type }) => (
                <DropdownMenuRadioItem key={type} value={type}>
                  {label(type)}
                </DropdownMenuRadioItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="area">
                {label("area")}
              </DropdownMenuRadioItem>
              {(planned || building) && <DropdownMenuSeparator />}
              {planned && (
                <DropdownMenuRadioItem value="planned">
                  {label("planned")}
                </DropdownMenuRadioItem>
              )}
              {building && (
                <DropdownMenuRadioItem value="section">
                  {label("section")}
                </DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div role="group" aria-label={t("toolsLabel")} className="flex">
          {ALL_TOOLS.filter((tool) => tools.includes(tool)).map((tool) => {
            const Icon = toolIcon[tool];
            const active = drawing?.tool === tool;
            return (
              <Button
                key={tool}
                variant={active ? "default" : "ghost"}
                size="icon-sm"
                aria-pressed={active}
                aria-label={t(`tools.${tool}`)}
                title={t(`tools.${tool}`)}
                onClick={() => {
                  const store = useStore.getState();
                  if (active) store.cancelDrawing();
                  else store.startDrawing({ target, tool });
                }}
              >
                <Icon />
              </Button>
            );
          })}
        </div>
      </div>
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
