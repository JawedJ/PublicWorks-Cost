import { fallbackDraft } from "@/lib/ai/parse";
import { PLANNED_FEATURES_PARAM } from "@/lib/geo/generate";
import { geocode } from "@/lib/geo/geocode";
import { directionView, kmBetween, siteQuery, zoomFor } from "@/lib/geo/place";
import { regionForPlace } from "@/lib/geo/region";
import {
  type ParseResponse,
  ParseResponseSchema,
  type ProjectDraft,
} from "@/lib/schemas";
import { capitalizeName } from "@/lib/names";
import { useStore } from "@/lib/store/store";

export { capitalizeName };

// Client helpers for the creation flow (P7.2/P7.3; A wires the navigation in P7.4).

/** The draft with every component name (and the project name) capitalized. */
export function capitalizeDraft(draft: ProjectDraft): ProjectDraft {
  return {
    ...draft,
    name: capitalizeName(draft.name),
    components: draft.components.map((c) => ({
      ...c,
      name: capitalizeName(c.name),
    })),
  };
}

/** Calls /api/ai/parse. Never throws: any error → local keyword fallback. */
export async function requestParse(
  prompt: string,
  locale: "en" | "fr",
): Promise<ParseResponse> {
  try {
    const res = await fetch("/api/ai/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, locale }),
    });
    if (res.ok) return ParseResponseSchema.parse(await res.json());
    return {
      draft: fallbackDraft(prompt, locale),
      source: "fallback",
      notice: res.status === 429 ? "ai_busy" : "ai_unavailable",
    };
  } catch {
    return {
      draft: fallbackDraft(prompt, locale),
      source: "fallback",
      notice: "ai_unavailable",
    };
  }
}

/** Starts a new project from a reviewed build list (components are planned, not drawn). */
export function applyDraft(draft: ProjectDraft): string[] {
  const store = useStore.getState();
  const region = draft.municipality && regionForPlace(draft.municipality);
  store.newProject({
    name: draft.name,
    ...(draft.municipality && { municipality: draft.municipality }),
    ...(region && { region }),
  });
  if (draft.startDate) store.updateSettings({ startDate: draft.startDate });
  return store.addComponents(
    draft.components.map((c) => ({
      type: c.type,
      subtype: c.subtype,
      name: c.name,
      // Park features from the prompt are placed with the park (A's withPlannedFeatures).
      params: c.features?.length
        ? { ...c.params, [PLANNED_FEATURES_PARAM]: c.features.join(",") }
        : c.params,
      ...(c.customPricing && { customPricing: c.customPricing }),
      paramMeta: Object.fromEntries(
        Object.keys(c.params).map((k) => [
          k,
          {
            source: "ai_prompt" as const,
            ...(c.evidence[k] && { evidence: c.evidence[k] }),
          },
        ]),
      ),
    })),
  );
}

const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || undefined;

/**
 * Moves the project (and so the map) to where it is: the site within the
 * municipality when one is given ("near Laurel Creek" → that creek, street
 * level; "north end" → that part of town), else the municipality itself, close
 * enough to work in. Also sets the pricing region from the result if the name
 * alone didn't. Never throws: not found or offline → the project stays put.
 */
export async function locateMunicipality(
  locale: string,
  site?: string,
): Promise<void> {
  const { project } = useStore.getState();
  const place = project.municipality.trim();
  if (!place) return;
  const opts = { language: locale, maptilerKey };
  try {
    const [city] = await geocode(place, opts);
    // The user may have started another project meanwhile.
    if (!city || useStore.getState().project.id !== project.id) return;
    let view: { lng: number; lat: number; zoom: number } = {
      lng: city.center[0],
      lat: city.center[1],
      // Close enough to see streets, even for a whole city.
      zoom: zoomFor(city, 13.5, 15),
    };
    if (site?.trim()) {
      const query = siteQuery(site, place);
      const hits = query ? await geocode(`${query}, ${place}`, opts) : [];
      // A match in (or right by) the municipality, and not the municipality itself.
      const spot = hits.find(
        (h) =>
          kmBetween(h.center, city.center) < 25 &&
          !(kmBetween(h.center, city.center) < 0.3 && h.label === city.label),
      );
      if (spot)
        view = {
          lng: spot.center[0],
          lat: spot.center[1],
          zoom: zoomFor(spot, 15, 16.5),
        };
      else view = directionView(city, site) ?? view;
    }
    if (useStore.getState().project.id !== project.id) return;
    const region = regionForPlace(place) ?? regionForPlace(city.label);
    useStore.getState().updateProjectInfo({
      location: view,
      ...(region && { region }),
    });
  } catch {
    // Keep the default location.
  }
}
