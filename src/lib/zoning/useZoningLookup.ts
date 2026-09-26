"use client";

import { useEffect } from "react";
import { componentCentre } from "@/lib/geo/edit";
import { type Component, ZoningResponseSchema } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// SPEC 8.3 (MVP): looks up each drawn building's zone in the background when
// buildings are added or moved (debounced), and stores it as `zoningContext`.
// A failed lookup keeps the previous result.

const DEBOUNCE_MS = 1500;

function points(components: Component[]) {
  return components
    .filter((c) => c.type === "building" && c.status === "drawn")
    .map((c) => {
      const p = componentCentre(c);
      return p ? { id: c.id, lng: p[0], lat: p[1] } : null;
    })
    .filter((p) => p !== null);
}

export function useZoningLookup() {
  // Key on building ids and positions (~10 m), not on every edit.
  const key = useStore((s) =>
    points(s.components)
      .map((p) => `${p.id}@${p.lng.toFixed(4)},${p.lat.toFixed(4)}`)
      .join("|"),
  );

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(async () => {
      const pts = points(useStore.getState().components).slice(0, 30);
      try {
        const res = await fetch("/api/zoning", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ points: pts }),
        });
        if (!res.ok) return;
        const { zones } = ZoningResponseSchema.parse(await res.json());
        useStore
          .getState()
          .setZoningContext({ fetchedAt: new Date().toISOString(), zones });
      } catch {
        // Keep the previous result; the next change retries.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);
}
