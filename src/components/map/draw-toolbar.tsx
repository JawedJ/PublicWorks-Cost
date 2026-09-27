"use client";

import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  Folder,
  FolderOpen,
  Frame,
  Lasso,
  Layers,
  Magnet,
  MapPin,
  Pentagon,
  Plus,
  Search,
  Signature,
  Spline,
  Square,
  Trees,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { typeIcon } from "./type-icons";

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

/** Types offered in the Add picker, in order. */
const TYPES: Exclude<ComponentType, "custom">[] = [
  "building",
  "park",
  "road",
  "parking",
  "structure",
];

/** What the Add picker has chosen; turned into a `DrawTarget` against the current selection. */
type Choice =
  | { kind: "new"; type: ComponentType; subtype: string }
  | { kind: "custom" }
  | { kind: "feature"; featureKind: string }
  | { kind: "customFeature" }
  | { kind: "area" }
  | { kind: "planned" }
  | { kind: "section" }
  | { kind: "hole" };

function TypeIcon({ type }: { type: ComponentType }) {
  const I = typeIcon[type];
  return <I />;
}

/** A catalog name without its pricing note: "Skate park (per m²)" → "Skate park". */
const plainLabel = (label: string) => label.replace(/\s*\(per [^)]*\)/g, "");

/** Components that can hold placed features (a park's playground). */
function featureHost(c: Component | undefined) {
  return c?.geometry && (c.type === "park" || c.type === "building")
    ? c
    : undefined;
}

type PickerItem = {
  key: string;
  label: string;
  group: string;
  icon: LucideIcon | typeof EllipseIcon;
  choice: Choice;
};

/**
 * Adding things to the design (P1.5, reworked for ease of use): one "Add" button
 * opens a searchable picker. Buildings, parks, lots and structures drop with one
 * click on the map at a typical size (then reshape freely); roads, custom elements
 * and parts of a selected component start drawing. While adding, a compact bar
 * shows what is being added, the other ways to draw it, and cancel.
 */
export function DrawToolbar() {
  const t = useTranslations("design.draw");
  const locale = useLocale() as "en" | "fr";
  const components = useStore((s) => s.components);
  const drawing = useStore((s) => s.drawing);
  const drawNotice = useStore((s) => s.drawNotice);
  const smartPlacing = useStore((s) => s.smartPlacing);
  const snapToStreets = useStore((s) => s.snapToStreets);
  const selectedSectionId = useStore((s) => s.selectedElement?.sectionId);
  const selectedFeatureId = useStore((s) => s.selectedElement?.featureId);
  const selected = useStore((s) =>
    s.components.find((c) => c.id === s.selectedComponentId),
  );
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Folders opened in the picker (all open while searching). */
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  /** A custom element or feature waiting for its name. */
  const [naming, setNaming] = useState<Choice | null>(null);
  const [customName, setCustomName] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  const planned = selected?.status === "planned" ? selected : undefined;
  // Selecting an undrawn component points the toolbar at it and starts drawing it.
  const [pointedAt, setPointedAt] = useState<string | undefined>();
  if (planned?.id !== pointedAt) {
    setPointedAt(planned?.id);
    if (planned) setChoice({ kind: "planned" });
  }
  useEffect(() => {
    if (!planned) return;
    const store = useStore.getState();
    if (store.drawing || store.smartPlacing) return;
    const target = { kind: "planned", componentId: planned.id } as const;
    const first = toolsForTarget(target, store.components)[0];
    if (first) store.startDrawing({ target, tool: first });
    // Only when a different planned component becomes selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planned?.id]);

  // Back to the plain "Add" button once the shape is placed or cancelled.
  const busy = Boolean(drawing || smartPlacing);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) setChoice(null);
    wasBusy.current = busy;
  }, [busy]);

  // Close the picker on a click outside it or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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

  function targetFor(c: Choice, customLabel = name): DrawTarget | null {
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
        return host && customLabel
          ? {
              kind: "feature",
              componentId: host.id,
              featureKind: "custom",
              customLabel,
            }
          : null;
      case "custom":
        return customLabel
          ? {
              kind: "new",
              type: "custom",
              subtype: "custom",
              name: customLabel,
            }
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
        return plainLabel(featureLabel(c.featureKind));
      case "customFeature":
        return name || t("targets.customFeatureShort");
      case "custom":
        return name || t("targets.customShort");
      case "new":
        return subtypeLabel(c.type, c.subtype);
    }
  }

  const iconFor = (c: Choice): React.ReactNode => {
    switch (c.kind) {
      case "new":
        return <TypeIcon type={c.type} />;
      case "planned":
        return planned ? <TypeIcon type={planned.type} /> : <Plus />;
      case "custom":
        return <TypeIcon type="custom" />;
      case "feature":
      case "customFeature":
        return <Trees />;
      case "section":
        return <Layers />;
      case "hole":
        return <CircleDashed />;
      case "area":
        return <Frame />;
    }
  };

  // The active choice, if its component is still selected.
  const active = choice && targetFor(choice) ? choice : null;
  const target = active ? targetFor(active) : (drawing?.target ?? null);
  const smartTarget =
    target &&
    (target.kind === "new" || target.kind === "planned") &&
    !(target.kind === "new" && target.type === "custom") &&
    !(target.kind === "planned" && planned?.type === "custom")
      ? target
      : null;
  const tools = target ? toolsForTarget(target, components) : [];
  const isRoad =
    target &&
    ((target.kind === "new" && target.type === "road") ||
      (target.kind === "planned" && planned?.type === "road"));

  /** Starts adding: one click on the map for known types (not roads), else drawing. */
  function begin(c: Choice, customLabel?: string) {
    const tgt = targetFor(c, customLabel);
    if (!tgt) return;
    setChoice(c);
    setOpen(false);
    setQuery("");
    const store = useStore.getState();
    const oneClick =
      (tgt.kind === "new" && tgt.type !== "custom" && tgt.type !== "road") ||
      false;
    if (oneClick) {
      store.startSmartPlacing(tgt as Extract<DrawTarget, { kind: "new" }>);
      return;
    }
    const first = toolsForTarget(tgt, store.components)[0];
    if (first) store.startDrawing({ target: tgt, tool: first });
  }

  function pick(item: PickerItem) {
    if (item.choice.kind === "custom" || item.choice.kind === "customFeature") {
      setNaming(item.choice);
      setCustomName("");
      return;
    }
    begin(item.choice);
  }

  const items = useMemo<PickerItem[]>(() => {
    const out: PickerItem[] = [];
    const ctx = selected ? t("addTo", { name: selected.name }) : "";
    if (planned)
      out.push({
        key: "planned",
        label: t("targets.planned", { name: planned.name }),
        group: ctx,
        icon: typeIcon[planned.type],
        choice: { kind: "planned" },
      });
    if (building)
      out.push({
        key: "section",
        label: t("pick.section"),
        group: ctx,
        icon: Layers,
        choice: { kind: "section" },
      });
    if (holed)
      out.push({
        key: "hole",
        label: t("pick.hole"),
        group: ctx,
        icon: CircleDashed,
        choice: { kind: "hole" },
      });
    if (host) {
      for (const kind of Object.keys(parkFeatures.features))
        out.push({
          key: `feature:${kind}`,
          label: featureLabel(kind),
          group: ctx,
          icon: Trees,
          choice: { kind: "feature", featureKind: kind },
        });
      out.push({
        key: "customFeature",
        label: t("pick.customFeature"),
        group: ctx,
        icon: Trees,
        choice: { kind: "customFeature" },
      });
    }
    for (const type of TYPES)
      for (const st of templates[type].subtypes)
        out.push({
          key: `${type}:${st.id}`,
          label: st.label[locale],
          group: t(`groups.${type}`),
          icon: typeIcon[type],
          choice: { kind: "new", type, subtype: st.id },
        });
    out.push({
      key: "custom",
      label: t("pick.custom"),
      group: t("groups.other"),
      icon: typeIcon.custom,
      choice: { kind: "custom" },
    });
    out.push({
      key: "area",
      label: t("targets.area"),
      group: t("groups.other"),
      icon: Frame,
      choice: { kind: "area" },
    });
    return out;
    // Labels depend on the selection and locale only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.name, planned, building, holed, host, locale]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(q))
    : items;
  const groups = [...new Set(shown.map((i) => i.group))];

  return (
    <div ref={panel} className="relative w-fit text-sm">
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-card p-1.5 shadow-sm">
        {!active && !busy ? (
          <Button
            size="sm"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <Plus /> {t("add")}
            <ChevronDown className="opacity-60" />
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="max-w-56"
              title={t("changeWhat")}
              onClick={() => setOpen(!open)}
            >
              {active ? iconFor(active) : <Plus />}
              <span className="truncate">
                {active ? label(active) : t("adding")}
              </span>
              <ChevronDown className="opacity-60" />
            </Button>
            {smartTarget && (
              <Button
                variant={smartPlacing ? "default" : "ghost"}
                size="sm"
                aria-pressed={Boolean(smartPlacing)}
                title={t("tools.smart")}
                onClick={() =>
                  useStore
                    .getState()
                    .startSmartPlacing(smartPlacing ? null : smartTarget)
                }
              >
                <WandSparkles /> {t("oneClick")}
              </Button>
            )}
            {tools.length > 0 && (
              <div
                role="group"
                aria-label={t("toolsLabel")}
                className="flex items-center border-l pl-1"
              >
                {ALL_TOOLS.filter((tool) => tools.includes(tool)).map(
                  (tool) => {
                    const ToolIcon = toolIcon[tool];
                    const on = drawing?.tool === tool;
                    return (
                      <Button
                        key={tool}
                        variant={on ? "default" : "ghost"}
                        size="icon-sm"
                        aria-pressed={on}
                        aria-label={t(`tools.${tool}`)}
                        title={t(`tools.${tool}`)}
                        onClick={() => {
                          if (!target) return;
                          const store = useStore.getState();
                          if (on) store.cancelDrawing();
                          else store.startDrawing({ target, tool });
                        }}
                      >
                        <ToolIcon />
                      </Button>
                    );
                  },
                )}
              </div>
            )}
            {isRoad && tools.includes("line") && (
              <Button
                variant={snapToStreets ? "default" : "ghost"}
                size="icon-sm"
                aria-pressed={snapToStreets}
                aria-label={t("tools.snap")}
                title={t("tools.snap")}
                onClick={() =>
                  useStore.getState().setSnapToStreets(!snapToStreets)
                }
              >
                <Magnet />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("cancel")}
              title={t("cancel")}
              onClick={() => {
                const store = useStore.getState();
                store.cancelDrawing();
                store.startSmartPlacing(null);
                setChoice(null);
              }}
            >
              <X />
            </Button>
          </>
        )}
      </div>

      {(smartPlacing || drawing) && !open && (
        <p
          role="status"
          className="mt-1 max-w-80 rounded-md border bg-card px-2 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          {smartPlacing ? t("hints.smartShort") : t(`hints.${drawing!.tool}`)}{" "}
          {t("hints.cancel")}
        </p>
      )}
      {!busy && drawNotice && (
        <p
          role="status"
          className="mt-1 max-w-80 rounded-md border bg-card px-2 py-1.5 text-xs text-muted-foreground shadow-sm"
        >
          {t(`notices.${drawNotice}`)}
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={t("pickerLabel")}
          className="absolute top-full left-0 z-20 mt-1 flex max-h-[65vh] w-80 flex-col overflow-hidden rounded-md border bg-card shadow-lg"
        >
          {naming ? (
            <form
              className="flex flex-col gap-2 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name) return;
                const c = naming;
                setNaming(null);
                begin(c, name);
              }}
            >
              <label className="text-xs font-medium">
                {naming.kind === "customFeature"
                  ? t("customFeatureNameLabel", { name: host?.name ?? "" })
                  : t("customNameLabel")}
              </label>
              <input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t("customNamePlaceholder")}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNaming(null)}
                >
                  {t("back")}
                </Button>
                <Button type="submit" size="sm" disabled={!name}>
                  {t("startDrawing")}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-2">
                <Search className="size-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && shown[0]) pick(shown[0]);
                  }}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchLabel")}
                  className="h-9 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <div className="overflow-y-auto py-1">
                {groups.map((g) => {
                  const inGroup = shown.filter((i) => i.group === g);
                  // Every folder starts closed; a click opens it, and searching opens them all.
                  const isOpen = Boolean(q) || openFolders.has(g);
                  const FolderIcon = isOpen ? FolderOpen : Folder;
                  return (
                    <div key={g}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenFolders((prev) => {
                            const next = new Set(prev);
                            if (next.has(g)) next.delete(g);
                            else next.add(g);
                            return next;
                          })
                        }
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      >
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-90",
                          )}
                        />
                        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{g}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {inGroup.length}
                        </span>
                      </button>
                      {isOpen &&
                        inGroup.map((i) => {
                          const ItemIcon = i.icon;
                          return (
                            <button
                              key={i.key}
                              type="button"
                              onClick={() => pick(i)}
                              className="flex w-full items-center gap-2 py-1.5 pr-3 pl-10 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            >
                              <ItemIcon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                {plainLabel(i.label)}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
                {shown.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    {t("noMatches")}
                  </p>
                )}
              </div>
              <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                {t("pickerHint")}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
