import { fallbackDraft } from "@/lib/ai/parse";
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
  store.newProject({
    name: draft.name,
    ...(draft.municipality && { municipality: draft.municipality }),
  });
  if (draft.startDate) store.updateSettings({ startDate: draft.startDate });
  return store.addComponents(
    draft.components.map((c) => ({
      type: c.type,
      subtype: c.subtype,
      name: c.name,
      params: c.params,
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
