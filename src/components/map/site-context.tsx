"use client";

import { useEffect, useRef } from "react";
import { componentBounds, featureBounds } from "@/lib/geo/bounds";
import { SiteContextSchema } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// Site context (P6): looked up in the background whenever the project's location
// changes (schools, hospitals, waterways, rail near it, via /api/geo/context). The
// engine turns it into allowances and permit flags (src/engine/site.ts); nothing is
// drawn on the map. A failed lookup keeps the previous result.

/** Largest search box the API accepts (degrees of longitude, latitude), a bit under its limit. */
const MAX_SPAN = [0.075, 0.055] as const;
/** Wait for edits to settle before looking up. */
const DEBOUNCE_MS = 2000;

/** The project's search box: its extent plus ~400 m, capped to ~5 km around its centre. */
function projectBbox(pad = 0.004): [number, number, number, number] | null {
  const { components, areaBoundary } = useStore.getState();
  const boxes = [
    ...components.map(componentBounds),
    areaBoundary ? featureBounds(areaBoundary) : null,
  ].filter((b): b is NonNullable<typeof b> => b !== null);
  if (!boxes.length) return null;
  const w = Math.min(...boxes.map((b) => b[0])) - pad;
  const s = Math.min(...boxes.map((b) => b[1])) - pad;
  const e = Math.max(...boxes.map((b) => b[2])) + pad;
  const n = Math.max(...boxes.map((b) => b[3])) + pad;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hw = Math.min((e - w) / 2, MAX_SPAN[0] / 2);
  const hh = Math.min((n - s) / 2, MAX_SPAN[1] / 2);
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}

/** Rounded to ~100 m so small edits don't trigger a new lookup. */
const keyOf = (b: number[]) => b.map((v) => v.toFixed(3)).join(",");

/** Keeps `project.siteContext` in step with where the design is. Renders nothing. */
export function SiteContextLookup() {
  // Changes whenever any geometry or the project area changes.
  const components = useStore((s) => s.components);
  const areaBoundary = useStore((s) => s.areaBoundary);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const bbox = projectBbox();
    if (!bbox) return;
    const key = keyOf(bbox);
    if (key === lastKey.current) return;
    // A project that arrives with site context (sample, project file) keeps it until it moves.
    if (lastKey.current === null && useStore.getState().project.siteContext) {
      lastKey.current = key;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/geo/context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bbox }),
          signal: controller.signal,
        });
        const parsed = SiteContextSchema.safeParse(await res.json());
        if (!parsed.success || parsed.data.source === "unavailable") return;
        lastKey.current = key;
        useStore.getState().setSiteContext(parsed.data);
      } catch {
        // Offline or aborted: keep what we have and try again on the next change.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [components, areaBoundary]);

  return null;
}
