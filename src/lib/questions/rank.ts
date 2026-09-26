import { resolveParams } from "@/engine/params";
import { templates } from "@/engine/templates";
import type {
  ParamDefinition,
  ParamValue,
  Question,
  QuestionsRequest,
} from "@/lib/schemas";

// SPEC 9.2: rank unanswered params by cost impact × the component's share of
// project cost. This is the fallback, and the AI picks from the same candidates.

export const MAX_QUESTIONS = 8;

/** Never asked: the drawing already answers them. */
const NOT_ASKED = new Set(["gfaOverrideM2", "lengthM", "areaM2", "storeys"]);

/** Building special spaces only make sense for some subtypes. */
const SPECIAL_SPACES: Record<string, string[]> = {
  gymnasium: ["community_centre", "school", "secondary_school"],
  indoorPool: ["community_centre", "aquatic_centre", "secondary_school"],
  iceRink: ["community_centre", "ice_arena"],
  commercialKitchen: [
    "community_centre",
    "school",
    "secondary_school",
    "hospital",
  ],
  apparatusBays: ["fire_station"],
  sallyPort: ["police_station"],
  councilChamber: ["municipal_office"],
};

function relevant(type: string, subtype: string, paramId: string) {
  if (NOT_ASKED.has(paramId)) return false;
  const only = type === "building" ? SPECIAL_SPACES[paramId] : undefined;
  return !only || only.includes(subtype);
}

export type Candidate = {
  /** `${componentId}:${paramId}`. */
  id: string;
  componentId: string;
  componentName: string;
  type: QuestionsRequest["components"][number]["type"];
  subtype: string;
  share: number;
  def: ParamDefinition;
  /** Current (default) value, used as the suggestion. */
  suggested: ParamValue;
  alsoApplies: string[];
  score: number;
};

/** Every unanswered param, one per type + param ("soil for all roads"), best first. */
export function candidates(req: QuestionsRequest): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of req.components) {
    if (c.type === "custom") continue;
    const tpl = templates[c.type];
    const values = resolveParams(tpl, c.subtype, c.params);
    for (const def of tpl.paramCatalog) {
      if (def.costImpact < 2 || !relevant(c.type, c.subtype, def.id)) continue;
      if ((c.sources[def.id] ?? "default") !== "default") continue;
      const score = def.costImpact * Math.max(c.share, 0.02);
      // Buildings group with the same kind of building only; roads, parks and
      // structures with their whole type ("soil for all roads").
      const group = c.type === "building" ? `${c.type}/${c.subtype}` : c.type;
      const key = `${group}:${def.id}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, {
          id: `${c.id}:${def.id}`,
          componentId: c.id,
          componentName: c.name,
          type: c.type,
          subtype: c.subtype,
          share: c.share,
          def,
          suggested: values[def.id]!,
          alsoApplies: [],
          score,
        });
        continue;
      }
      // Same question for another component of this type: ask once, apply to all.
      if (score > prev.score) {
        byKey.set(key, {
          ...prev,
          id: `${c.id}:${def.id}`,
          componentId: c.id,
          componentName: c.name,
          subtype: c.subtype,
          share: c.share,
          suggested: values[def.id]!,
          alsoApplies: [...prev.alsoApplies, prev.componentId],
          score: score + prev.score / 2,
        });
      } else {
        prev.alsoApplies.push(c.id);
        prev.score += score / 2;
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

export function toQuestion(
  c: Candidate,
  reason?: string,
  suggested?: ParamValue,
): Question {
  return {
    id: c.id,
    componentId: c.componentId,
    paramId: c.def.id,
    reason: reason || c.def.why.en,
    suggested: suggested ?? c.suggested,
    alsoApplies: c.alsoApplies,
  };
}

/** Deterministic questions: the top candidates with the catalog's own reason. */
export function fallbackQuestions(req: QuestionsRequest): Question[] {
  return candidates(req)
    .slice(0, MAX_QUESTIONS)
    .map((c) => toQuestion(c));
}

/** Coerces an answer to the param's type; null if it can't be valid. */
export function coerceAnswer(
  def: ParamDefinition,
  raw: unknown,
): ParamValue | null {
  if (def.type === "boolean") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true" || raw === "yes") return true;
    if (raw === "false" || raw === "no") return false;
    return null;
  }
  if (def.type === "enum") {
    const v = String(raw);
    return def.options?.some((o) => o.value === v) ? v : null;
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
}
