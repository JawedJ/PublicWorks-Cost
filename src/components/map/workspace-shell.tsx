"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "@/lib/store/store";
import { EstimatePanel } from "@/components/estimate/estimate-panel";
import { ResizeHandle } from "@/components/layout/resize-handle";
import { SiteScene } from "@/components/visuals/site-scene";
import { ComponentLayers } from "./component-layers";
import { ComponentInspector } from "./component-inspector";
import { ComponentList } from "./component-list";
import { DrawController } from "./draw-controller";
import { DrawToolbar } from "./draw-toolbar";
import { EditToolbar } from "./edit-toolbar";
import { Geocoder } from "./geocoder";
import { MapProvider } from "./map-context";
import { MapView } from "./map-view";
import { SmartPlacer } from "./smart-placer";
import { TransformHandles } from "./transform-handles";
import { ViewSwitcher } from "./view-switcher";

/** Warns before leaving the page with a design in progress (projects aren't saved; SPEC 15). */
function useUnsavedWarning() {
  const hasWork = useStore(
    (s) => s.components.length > 0 || s.areaBoundary !== null,
  );
  useEffect(() => {
    if (!hasWork) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [hasWork]);
}

const clamp = (v: number, min: number, max: number) =>
  Math.round(Math.min(Math.max(v, min), max));

/**
 * Workspace layout: component list, view, and estimate panel (~28% wide by default).
 * On desktop, the list and the estimate panel can be resized by dragging their inner edges.
 */
export function WorkspaceShell() {
  const t = useTranslations("map");
  useUnsavedWarning();
  const viewMode = useStore((s) => s.viewMode);
  const tDesign = useTranslations("design");
  const listRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // null = default width from CSS; set once the user drags.
  const [listWidth, setListWidth] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);

  return (
    <MapProvider>
      <div className="flex min-h-0 flex-1 flex-col lg:h-full lg:flex-none lg:flex-row">
        <div className="flex shrink-0 flex-col lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-row">
          <section
            aria-label={t("viewLabel")}
            className="relative h-[60vh] lg:order-2 lg:h-auto lg:flex-1"
          >
            <MapView>
              <ComponentLayers />
              <DrawController />
              <TransformHandles />
              <SmartPlacer />
              <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
                <Geocoder />
                <DrawToolbar />
              </div>
              {viewMode === "site3d" && <SiteScene />}
              <div className="absolute top-3 right-14 z-30">
                <ViewSwitcher />
              </div>
              <div className="absolute bottom-10 left-1/2 z-10 flex w-full -translate-x-1/2 justify-center">
                <EditToolbar />
              </div>
            </MapView>
          </section>
          <aside
            ref={listRef}
            aria-label={tDesign("listLabel")}
            style={
              listWidth === null
                ? undefined
                : ({ "--list-w": `${listWidth}px` } as CSSProperties)
            }
            className={`relative max-h-72 overflow-x-hidden overflow-y-auto border-t bg-card lg:order-1 lg:max-h-none lg:overflow-visible lg:shrink-0 lg:border-t-0 lg:border-r ${
              listWidth === null ? "lg:w-64 xl:w-72" : "lg:w-(--list-w)"
            }`}
          >
            <ResizeHandle
              side="right"
              label={t("resizeList")}
              getWidth={() => listRef.current?.offsetWidth ?? 0}
              onResize={(w) => setListWidth(clamp(w, 200, 480))}
            />
            {/* On desktop the whole panel scrolls as one column when it doesn't fit. */}
            <div className="flex flex-col lg:h-full lg:overflow-x-hidden lg:overflow-y-auto">
              <ComponentList />
              <ComponentInspector />
            </div>
          </aside>
        </div>
        <aside
          ref={panelRef}
          aria-label={t("panelLabel")}
          style={
            panelWidth === null
              ? undefined
              : ({ "--panel-w": `${panelWidth}px` } as CSSProperties)
          }
          className={`relative flex min-h-64 flex-col border-t bg-card lg:shrink-0 lg:border-t-0 lg:border-l ${
            panelWidth === null ? "lg:w-[28%]" : "lg:w-(--panel-w)"
          }`}
        >
          <ResizeHandle
            side="left"
            label={t("resizePanel")}
            getWidth={() => panelRef.current?.offsetWidth ?? 0}
            onResize={(w) =>
              setPanelWidth(clamp(w, 280, window.innerWidth * 0.6))
            }
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <EstimatePanel />
          </div>
        </aside>
      </div>
    </MapProvider>
  );
}
