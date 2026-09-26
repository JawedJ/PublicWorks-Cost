import { z } from "zod";
import { keywordParse } from "@/components/landing/keyword-parse";
import { parkFeatures } from "@/data";
import { templates } from "@/engine/templates";
import {
  type BuildListItem,
  ComponentTypeSchema,
  type ComponentType,
  type ParamDefinition,
  type ParamValue,
  type ParseResponse,
  type ProjectDraft,
} from "@/lib/schemas";
import { type AIProvider, AIUnavailableError } from "./provider";

// P7.2 (SPEC 9.1): prompt → build list. The AI only picks types, subtypes, counts,
// and catalog params; everything is checked against the engine catalogs here.
// Any AI failure → keyword fallback (A's matcher from the landing page).

const MAX_PER_ITEM = 20;

/** Size hints A's smart start / Generate layout read; not engine params (geometry wins once drawn). */
const SIZE_HINTS: Partial<Record<ComponentType, ParamDefinition[]>> = {
  building: [hint("storeys", "storeys", 1, 60)],
  park: [hint("areaM2", "m²", 1, 5_000_000)],
  road: [hint("lengthM", "m", 1, 50_000)],
  parking: [hint("areaM2", "m²", 1, 500_000)],
};

function hint(
  id: string,
  unit: string,
  min: number,
  max: number,
): ParamDefinition {
  const label = { en: `Size hint: ${id}`, fr: `Indication de taille : ${id}` };
  return {
    id,
    label,
    type: "number",
    unit,
    default: 0,
    min,
    max,
    costImpact: 1,
    why: label,
  };
}

/** Engine catalog plus size hints for a type. */
function paramDefs(type: ComponentType): ParamDefinition[] {
  return [...templates[type].paramCatalog, ...(SIZE_HINTS[type] ?? [])];
}

/** What the model returns. Flat and required-only so it suits provider JSON schemas. */
const AiDraftSchema = z.object({
  name: z.string(),
  municipality: z.string(),
  startDate: z.string(),
  components: z.array(
    z.object({
      type: ComponentTypeSchema,
      subtype: z.string(),
      name: z.string(),
      count: z.int(),
      sourcePhrase: z.string(),
      spatialHint: z.string(),
      features: z.array(z.string()),
      params: z.array(
        z.object({ id: z.string(), value: z.string(), evidence: z.string() }),
      ),
    }),
  ),
});
type AiDraft = z.infer<typeof AiDraftSchema>;

function catalogText(): string {
  return ComponentTypeSchema.options
    .map((type) => {
      const t = templates[type];
      const subtypes = t.subtypes.map((s) => s.id).join(", ");
      const params = paramDefs(type)
        .map((p) => {
          const detail =
            p.type === "enum"
              ? `one of ${p.options?.map((o) => o.value).join("|")}`
              : p.type === "number"
                ? `number${p.unit ? ` in ${p.unit}` : ""}`
                : "true|false";
          return `  - ${p.id} (${detail}): ${p.label.en}`;
        })
        .join("\n");
      const features =
        type === "park"
          ? `\n  features: ${Object.keys(parkFeatures.features).join(", ")}`
          : "";
      return `type ${type}; subtypes: ${subtypes}\n${params || "  (no params)"}${features}`;
    })
    .join("\n\n");
}

const SYSTEM = `You turn a municipal infrastructure request into a build list for a cost estimating tool.
Rules:
- List every component mentioned. Use only the types, subtypes, and param ids in the catalog below.
- count = how many identical components ("two fire stations" → 2). Otherwise 1.
- Only set a param when the prompt clearly states it; value as text (e.g. "3", "poor", "true"); evidence = the exact phrase.
- Sizes: building floor area → gfaOverrideM2, storeys → storeys, park area → areaM2 (1 ha = 10000), road length → lengthM.
- Building amenities are params of that building, not components: pool → indoorPool, gym → gymnasium, rink → iceRink, kitchen → commercialKitchen, basement or underground parking → basement, bays → apparatusBays, elevators → extraElevators. Set every one the prompt mentions.
- Surface parking ("a parking lot", "parking for 40 cars") is its own component: type parking, subtype surface_lot, stalls = the number of cars/spaces, areaM2 if an area is given. Underground parking is not a lot: it's basement on the building.
- Park amenities are features of their park, not components: put their ids in that park's features. If no park is mentioned, add one for them. Other types: features = [].
- Anything not in the catalog → type "custom", subtype "custom", keeping its name.
- Never output costs or prices.
- Resolve relative dates ("next spring") from today's date.
- name: short project name. municipality, startDate (YYYY-MM-DD), spatialHint: empty string if not stated.
- Write names in the user's language.

Catalog:
`;

function coerce(def: ParamDefinition, raw: string): ParamValue | undefined {
  const v = raw.trim();
  if (def.type === "boolean") {
    if (/^(true|yes|oui)$/i.test(v)) return true;
    if (/^(false|no|non)$/i.test(v)) return false;
    return undefined;
  }
  if (def.type === "enum")
    return def.options?.some((o) => o.value === v) ? v : undefined;
  const n = Number(v.replace(/[, ]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(def.max ?? n, Math.max(def.min ?? n, n));
}

function subtypeLabel(
  type: ComponentType,
  subtype: string,
  locale: "en" | "fr",
) {
  return (
    templates[type].subtypes.find((s) => s.id === subtype)?.label[locale] ??
    subtype
  );
}

/** Numbers repeated names ("Local street 1", "Local street 2"). */
function expand(item: BuildListItem, count: number): BuildListItem[] {
  const n = Math.min(Math.max(Math.round(count) || 1, 1), MAX_PER_ITEM);
  if (n === 1) return [item];
  return Array.from({ length: n }, (_, i) => ({
    ...item,
    name: `${item.name} ${i + 1}`,
    params: { ...item.params },
    evidence: { ...item.evidence },
  }));
}

/** Validates the model's draft against the engine catalogs. Pure; exported for tests. */
export function toProjectDraft(
  raw: AiDraft,
  locale: "en" | "fr",
): ProjectDraft {
  const components = raw.components.flatMap((c) => {
    const t = templates[c.type];
    const subtype = t.subtypes.some((s) => s.id === c.subtype)
      ? c.subtype
      : t.subtypes[0]!.id;
    const params: Record<string, ParamValue> = {};
    const evidence: Record<string, string> = {};
    for (const p of c.params) {
      const def = paramDefs(c.type).find((d) => d.id === p.id);
      const value = def && coerce(def, p.value);
      if (value === undefined) continue;
      params[p.id] = value;
      if (p.evidence) evidence[p.id] = p.evidence;
    }
    const item: BuildListItem = {
      type: c.type,
      subtype,
      name: c.name.trim() || subtypeLabel(c.type, subtype, locale),
      params,
      evidence,
      ...(c.spatialHint.trim() && { spatialHint: c.spatialHint.trim() }),
      ...(c.sourcePhrase.trim() && { sourcePhrase: c.sourcePhrase.trim() }),
      ...(c.type === "park" && {
        features: c.features.filter((f) => f in parkFeatures.features),
      }),
    };
    return expand(item, c.count);
  });
  const startDate = z.iso.date().safeParse(raw.startDate.trim());
  return {
    name: raw.name.trim() || components[0]?.name || "Project",
    ...(raw.municipality.trim() && { municipality: raw.municipality.trim() }),
    ...(startDate.success && { startDate: startDate.data }),
    components,
  };
}

/** Deterministic fallback: A's keyword matcher, named like the landing page does. */
export function fallbackDraft(
  prompt: string,
  locale: "en" | "fr",
): ProjectDraft {
  const counts: Record<string, number> = {};
  const components = keywordParse(prompt).map((p): BuildListItem => {
    counts[p.subtype] = (counts[p.subtype] ?? 0) + 1;
    return {
      ...p,
      name: `${subtypeLabel(p.type, p.subtype, locale)} ${counts[p.subtype]}`,
      evidence: {},
    };
  });
  return { name: prompt.trim().slice(0, 60), components };
}

const cache = new Map<string, ParseResponse>();

export async function parsePrompt(
  prompt: string,
  locale: "en" | "fr",
  provider: AIProvider,
): Promise<ParseResponse> {
  const key = `${provider.name}:${locale}:${prompt.trim()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const raw = await provider.generateStructured({
      system: SYSTEM + catalogText(),
      prompt: `Today: ${new Date().toISOString().slice(0, 10)}\nLanguage: ${locale}\nRequest: ${prompt}`,
      schema: AiDraftSchema,
      // Extraction, not reasoning: the lite model is fast enough and keeps the landing snappy.
      fast: true,
    });
    const result: ParseResponse = {
      draft: toProjectDraft(raw, locale),
      source: "ai",
    };
    if (cache.size > 200) cache.clear();
    cache.set(key, result);
    return result;
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    if (err.reason !== "no_provider")
      console.warn("ai/parse fallback:", err.message);
    return {
      draft: fallbackDraft(prompt, locale),
      source: "fallback",
      ...(err.reason === "rate_limited"
        ? { notice: "ai_busy" as const }
        : err.reason !== "no_provider" && {
            notice: "ai_unavailable" as const,
          }),
    };
  }
}
