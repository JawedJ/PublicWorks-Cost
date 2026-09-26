"use client";

import {
  Bridge,
  Building2,
  Copy,
  Ellipsis,
  FilePlus,
  Eye,
  EyeOff,
  Pencil,
  Redo2,
  Route,
  Scan,
  Shapes,
  Shuffle,
  Sparkles,
  Trash2,
  Trees,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { northgateProject } from "@/lib/fixtures";
import { componentBounds, featureBounds } from "@/lib/geo/bounds";
import { intlLocale, type Locale } from "@/lib/i18n/routing";
import type { Component, ComponentType } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { cn } from "@/lib/utils";
import { useMap } from "./map-context";

const typeIcon: Record<ComponentType, LucideIcon> = {
  road: Route,
  park: Trees,
  building: Building2,
  structure: Bridge,
  custom: Shapes,
};

/** Undo/redo with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), except while typing. */
function useUndoShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true]")) return;
      const key = e.key.toLowerCase();
      const { undo, redo } = useStore.getState();
      if (key === "z" && !e.shiftKey) undo();
      else if ((key === "z" && e.shiftKey) || key === "y") redo();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Every component in the project, with select, zoom to, rename, duplicate, hide/show and delete. */
export function ComponentList() {
  const t = useTranslations("design.components");
  const map = useMap();
  const components = useStore((s) => s.components);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const canGenerate = useStore((s) =>
    s.components.some((c) => c.status === "planned"),
  );
  const canRegenerate = useStore((s) =>
    s.components.some((c) => c.origin === "generated" && c.status === "drawn"),
  );

  function layout(regenerate: boolean) {
    const store = useStore.getState();
    const area = store.areaBoundary && featureBounds(store.areaBoundary);
    const centre = area
      ? ([(area[0] + area[2]) / 2, (area[1] + area[3]) / 2] as [number, number])
      : map
        ? (map.getCenter().toArray() as [number, number])
        : null;
    if (!centre) return;
    store.generateLayout(
      centre,
      regenerate ? store.layoutSeed + 1 : store.layoutSeed,
    );
    const all = useStore
      .getState()
      .components.map(componentBounds)
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (all.length)
      map?.fitBounds(
        [
          Math.min(...all.map((b) => b[0])),
          Math.min(...all.map((b) => b[1])),
          Math.max(...all.map((b) => b[2])),
          Math.max(...all.map((b) => b[3])),
        ],
        { padding: 60 },
      );
  }
  const redo = useStore((s) => s.redo);
  useUndoShortcuts();
  const { estimate } = useEstimate();
  const locale = intlLocale[useLocale() as Locale];
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "CAD",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const costs = useMemo(
    () =>
      new Map(
        (estimate?.components ?? []).map((c) => [
          c.componentId,
          `${money.format(c.p50)} · ${Math.round(c.share * 100)}%`,
        ]),
      ),
    [estimate, money],
  );

  function loadSample() {
    const p = structuredClone(northgateProject);
    useStore.getState().loadDesign({
      components: p.components,
      areaBoundary: p.areaBoundary ?? null,
    });
    const b = p.areaBoundary && featureBounds(p.areaBoundary);
    if (b) map?.fitBounds(b, { padding: 40 });
    else
      map?.flyTo({
        center: [p.location.lng, p.location.lat],
        zoom: p.location.zoom,
      });
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-card px-3 py-2">
        <h2 className="flex-1 text-sm font-semibold">
          {t("title")}{" "}
          <span className="font-normal text-muted-foreground figures">
            ({components.length})
          </span>
        </h2>
        {(canGenerate || canRegenerate) && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={canGenerate ? t("generate") : t("regenerate")}
            title={canGenerate ? t("generate") : t("regenerate")}
            onClick={() => layout(!canGenerate)}
          >
            {canGenerate ? <Sparkles /> : <Shuffle />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("newProject")}
          title={t("newProject")}
          disabled={components.length === 0}
          onClick={() => {
            if (!window.confirm(t("newProjectConfirm"))) return;
            useStore.getState().newProject({ name: t("untitled") });
          }}
        >
          <FilePlus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={undo}
          disabled={!canUndo}
          aria-label={t("undo")}
          title={t("undo")}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={redo}
          disabled={!canRedo}
          aria-label={t("redo")}
          title={t("redo")}
        >
          <Redo2 />
        </Button>
      </div>
      {canGenerate && (
        <p className="border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {t("plannedHint", {
            n: components.filter((c) => c.status === "planned").length,
          })}
        </p>
      )}
      {components.length === 0 ? (
        <div className="space-y-3 p-3 text-sm text-muted-foreground">
          <p>{t("empty")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSample}
            disabled={!map}
          >
            {t("loadSample")}
          </Button>
        </div>
      ) : (
        <ul className="py-1">
          {components.map((c) => (
            <ComponentRow key={c.id} component={c} cost={costs.get(c.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ComponentRow({
  component: c,
  cost,
}: {
  component: Component;
  /** P50 and share of the total, when the component is estimated. */
  cost?: string;
}) {
  const t = useTranslations("design.components");
  const map = useMap();
  const selected = useStore((s) => s.selectedComponentId === c.id);
  const { selectComponent, renameComponent, duplicateComponent } =
    useStore.getState();
  const { setComponentVisible, removeComponent } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  // Set when "Rename" is chosen so the closing menu doesn't pull focus from the name field.
  const renameFromMenu = useRef(false);
  const Icon = typeIcon[c.type];
  const bounds = componentBounds(c);

  // Keep the row in view when it is selected on the map.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function zoomTo() {
    if (!map || !bounds) return;
    selectComponent(c.id);
    const [w, s, e, n] = bounds;
    if (w === e && s === n) map.flyTo({ center: [w, s], zoom: 17 });
    else map.fitBounds(bounds, { padding: 60, maxZoom: 18 });
  }

  return (
    <li
      ref={rowRef}
      className={cn(
        "group flex items-center gap-2 px-2 py-1",
        selected && "bg-accent",
        !c.visible && "text-muted-foreground",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-4 shrink-0", !c.visible && "opacity-50")}
      />
      {renaming ? (
        <RenameInput
          initial={c.name}
          label={t("renameLabel")}
          onDone={(name) => {
            setRenaming(false);
            if (name && name !== c.name) renameComponent(c.id, name);
          }}
        />
      ) : (
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => selectComponent(selected ? null : c.id)}
          onDoubleClick={() => setRenaming(true)}
          className="flex min-w-0 flex-1 flex-col items-start rounded-sm px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="w-full truncate text-sm">{c.name}</span>
          <span className="text-xs text-muted-foreground">
            {t(`types.${c.type}`)}
            {c.status === "planned" && ` · ${t("planned")}`}
            {cost && <span className="figures"> · {cost}</span>}
          </span>
        </button>
      )}
      <div
        className={cn(
          "flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
          (selected || !c.visible) && "opacity-100",
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={zoomTo}
          disabled={!bounds}
          aria-label={t("zoomTo", { name: c.name })}
          title={bounds ? t("zoomToShort") : t("notDrawn")}
        >
          <Scan />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setComponentVisible(c.id, !c.visible)}
          aria-label={t(c.visible ? "hide" : "show", { name: c.name })}
          aria-pressed={!c.visible}
          title={t(c.visible ? "hideShort" : "showShort")}
        >
          {c.visible ? <Eye /> : <EyeOff />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("more", { name: c.name })}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => {
              if (!renameFromMenu.current) return;
              renameFromMenu.current = false;
              e.preventDefault();
              rowRef.current?.querySelector("input")?.select();
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                renameFromMenu.current = true;
                setRenaming(true);
              }}
            >
              <Pencil /> {t("rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                duplicateComponent(c.id, t("copyName", { name: c.name }))
              }
            >
              <Copy /> {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => removeComponent(c.id)}
            >
              <Trash2 /> {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function RenameInput({
  initial,
  label,
  onDone,
}: {
  initial: string;
  label: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const finish = (name: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(name);
  };
  useEffect(() => ref.current?.select(), []);

  return (
    <input
      ref={ref}
      aria-label={label}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value.trim() || null);
        if (e.key === "Escape") finish(null);
      }}
      className="h-8 min-w-0 flex-1 rounded-sm border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}
