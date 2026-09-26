"use client";

import { Copy, FlipHorizontal2, FlipVertical2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { ElementRef } from "@/lib/geo/edit";
import type { Component } from "@/lib/schemas";
import { useStore, type Store } from "@/lib/store/store";
import { editableComponent } from "./draw-controller";

// Edit bar for the selected component: flip, duplicate, delete, and a short
// how-to for the on-map editing. Delete/Backspace deletes, Ctrl/Cmd+D duplicates.

/** What Delete removes: the selected feature or section (if it isn't the last one), else the component. */
function deleteTarget(
  c: Component,
  el: Store["selectedElement"],
): ElementRef | null {
  if (el?.featureId) return { role: "feature", id: el.featureId };
  if (el?.sectionId && (c.geometry?.sections?.length ?? 0) > 1)
    return { role: "section", id: el.sectionId };
  return null;
}

export function EditToolbar() {
  const t = useTranslations("design.edit");
  const tList = useTranslations("design.components");
  const component = useStore(editableComponent);
  const selectedElement = useStore((s) => s.selectedElement);
  const target = component && deleteTarget(component, selectedElement);

  const actions = {
    duplicate: () => {
      if (!component) return;
      useStore
        .getState()
        .duplicateComponent(
          component.id,
          tList("copyName", { name: component.name }),
        );
    },
    remove: () => {
      if (!component) return;
      const store = useStore.getState();
      if (target) store.removeElement(component.id, target);
      else store.removeComponent(component.id);
    },
  };
  // Keyboard shortcuts, except while typing or in a menu. Re-registered each render so they see the current selection.
  useEffect(() => {
    if (!component) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true], [role=menu]"))
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        actions.remove();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        actions.duplicate();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!component) return null;
  const { mirrorComponent } = useStore.getState();
  const deleteLabel = !target
    ? t("delete", { name: component.name })
    : target.role === "section"
      ? t("deleteSection")
      : t("deleteFeature");

  return (
    <div
      role="toolbar"
      aria-label={t("label", { name: component.name })}
      className="flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-md border bg-card p-1.5 text-sm shadow-sm"
    >
      <p className="max-w-96 px-1 text-xs text-muted-foreground">{t("hint")}</p>
      <div className="flex shrink-0 items-center border-l pl-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("mirrorHorizontal")}
          title={t("mirrorHorizontal")}
          onClick={() => mirrorComponent(component.id, "vertical")}
        >
          <FlipHorizontal2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("mirrorVertical")}
          title={t("mirrorVertical")}
          onClick={() => mirrorComponent(component.id, "horizontal")}
        >
          <FlipVertical2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("duplicate")}
          title={t("duplicate")}
          onClick={actions.duplicate}
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={actions.remove}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
