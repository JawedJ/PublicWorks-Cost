"use client";

import { useTranslations } from "next-intl";
import { ComponentLayers } from "./component-layers";
import { ComponentList } from "./component-list";
import { Geocoder } from "./geocoder";
import { MapProvider } from "./map-context";
import { MapView } from "./map-view";

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
              <div className="absolute top-3 left-3 z-10">
                <Geocoder />
              </div>
            </MapView>
          </section>
          <aside
            aria-label={tDesign("listLabel")}
            className="max-h-72 border-t bg-card lg:order-1 lg:max-h-none lg:w-64 lg:border-t-0 lg:border-r xl:w-72"
          >
            <ComponentList />
          </aside>
        </div>
        <aside
          aria-label={t("panelLabel")}
          className="flex min-h-64 flex-col border-t bg-card p-4 lg:flex-[2] lg:border-t-0 lg:border-l"
        >
          <p className="text-sm text-muted-foreground">
            {t("panelPlaceholder")}
          </p>
        </aside>
      </div>
    </MapProvider>
  );
}
