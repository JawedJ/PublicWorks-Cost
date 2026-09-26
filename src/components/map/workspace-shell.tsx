"use client";

import { useTranslations } from "next-intl";
import { MapProvider } from "./map-context";
import { MapView } from "./map-view";

/** Workspace layout: view on the left (~60%), estimate panel on the right. */
export function WorkspaceShell() {
  const t = useTranslations("map");

  return (
    <MapProvider>
      <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row">
        <section
          aria-label={t("viewLabel")}
          className="relative h-[60vh] shrink-0 lg:h-auto lg:flex-[3]"
        >
          <MapView />
        </section>
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
