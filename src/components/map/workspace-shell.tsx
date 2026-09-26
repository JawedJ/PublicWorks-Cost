"use client";

import { useTranslations } from "next-intl";
import { EstimatePanel } from "@/components/estimate/estimate-panel";
import { ComponentLayers } from "./component-layers";
import { ComponentInspector } from "./component-inspector";
import { ComponentList } from "./component-list";
import { DrawController } from "./draw-controller";
import { DrawToolbar } from "./draw-toolbar";
import { EditToolbar } from "./edit-toolbar";
import { Geocoder } from "./geocoder";
import { MapProvider } from "./map-context";
import { MapView } from "./map-view";
import { TransformHandles } from "./transform-handles";
import { ViewSwitcher } from "./view-switcher";

/** Workspace layout: component list and view on the left (~60%), estimate panel on the right. */
export function WorkspaceShell() {
  const t = useTranslations("map");
  const tDesign = useTranslations("design");

  return (
    <MapProvider>
      <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row">
        <div className="flex shrink-0 flex-col lg:min-h-0 lg:flex-[3] lg:flex-row">
          <section
            aria-label={t("viewLabel")}
            className="relative h-[60vh] lg:order-2 lg:h-auto lg:flex-1"
          >
            <MapView>
              <ComponentLayers />
              <DrawController />
              <TransformHandles />
              <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
                <Geocoder />
                <DrawToolbar />
              </div>
              <div className="absolute top-3 right-14 z-10">
                <ViewSwitcher />
              </div>
              <div className="absolute bottom-10 left-1/2 z-10 flex w-full -translate-x-1/2 justify-center">
                <EditToolbar />
              </div>
            </MapView>
          </section>
          <aside
            aria-label={tDesign("listLabel")}
            className="max-h-72 border-t bg-card lg:order-1 lg:max-h-none lg:w-64 lg:border-t-0 lg:border-r xl:w-72"
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <ComponentList />
              </div>
              <ComponentInspector />
            </div>
          </aside>
        </div>
        <aside
          aria-label={t("panelLabel")}
          className="flex min-h-64 flex-col overflow-y-auto border-t bg-card lg:flex-[2] lg:border-t-0 lg:border-l"
        >
          <EstimatePanel />
        </aside>
      </div>
    </MapProvider>
  );
}
