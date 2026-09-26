import { fallbackDraft } from "@/lib/ai/parse";
import { PLANNED_FEATURES_PARAM } from "@/lib/geo/generate";
import { geocode } from "@/lib/geo/geocode";
import { regionForPlace } from "@/lib/geo/region";
import {
  type ParseResponse,
  ParseResponseSchema,
  type ProjectDraft,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// Client helpers for the creation flow (P7.2/P7.3; A wires the navigation in P7.4).

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
 * Looks up the project's municipality and moves the project (and so the map)
 * there; also sets the pricing region from the result if the name alone didn't.
 * Never throws: not found or offline → the project stays where it is.
 */
export async function locateMunicipality(locale: string): Promise<void> {
  const { project } = useStore.getState();
  const place = project.municipality.trim();
  if (!place) return;
  try {
    const [hit] = await geocode(place, { language: locale, maptilerKey });
    // The user may have started another project meanwhile.
    const now = useStore.getState().project;
    if (!hit || now.id !== project.id) return;
    const [lng, lat] = hit.center;
    // Zoom that fits the place's extent, at least city level (12) and at most 15.
    const span = hit.bbox ? Math.max(hit.bbox[2] - hit.bbox[0], 1e-3) : 0.1;
    const zoom = Math.min(15, Math.max(12, Math.log2(360 / span) - 0.5));
    const region = regionForPlace(place) ?? regionForPlace(hit.label);
    useStore.getState().updateProjectInfo({
      location: { lng, lat, zoom },
      ...(region && { region }),
    });
  } catch {
    // Keep the default location.
  }
}
