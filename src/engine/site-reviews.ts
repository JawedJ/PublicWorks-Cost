import type { LineItem, ParamDefinition, ParamValue } from "@/lib/schemas";
import type { Flag } from "@/lib/schemas";
import { L, t } from "./text";
import type { ComponentTemplate } from "./types";

// Site conditions someone has checked (SPEC 8, per the human): a nearby school,
// hospital, rail line or watercourse adds an allowance and a warning from map
// distance alone. A review, from an uploaded document or an answer, settles it:
// "no special measures" removes the allowance and turns the warning into a note;
// "measures needed" keeps both. Answering counts toward the estimate class, so
// it also lowers the overrun risk.

export type SiteKind = "school" | "hospital" | "waterway" | "rail";

/** Site flag code (site.ts) → the review param that settles it. */
export const REVIEW_PARAM: Record<string, string> = {
  near_school: "schoolReview",
  near_hospital: "hospitalReview",
  near_waterway: "waterwayReview",
  near_rail: "railReview",
};

const opt = (value: string, en: string, fr: string) => ({
  value,
  label: L(en, fr),
});

const review = (
  id: string,
  what: string,
  whatFr: string,
  why: string,
): ParamDefinition => ({
  id,
  label: L(`${what} reviewed`, `${whatFr} : examen`),
  type: "enum",
  default: "not_reviewed",
  options: [
    opt("not_reviewed", "Not reviewed", "Non examiné"),
    opt(
      "no_measures",
      "Reviewed: no special measures needed",
      "Examiné : aucune mesure particulière",
    ),
    opt(
      "measures_needed",
      "Reviewed: measures needed",
      "Examiné : mesures nécessaires",
    ),
  ],
  costImpact: 3,
  why: L(why, why),
});

export const SITE_REVIEW_PARAMS: ParamDefinition[] = [
  review(
    "schoolReview",
    "School impact",
    "Impact sur l'école",
    "A school nearby usually means extra traffic control and restricted hours; a traffic review can rule that out.",
  ),
  review(
    "hospitalReview",
    "Hospital impact",
    "Impact sur l'hôpital",
    "Near a hospital, ambulance access and noise monitoring are usually required unless a review says otherwise.",
  ),
  review(
    "waterwayReview",
    "Watercourse permit",
    "Permis de cours d'eau",
    "Work near a watercourse usually needs a conservation authority permit and extra erosion control.",
  ),
  review(
    "railReview",
    "Rail line impact",
    "Impact ferroviaire",
    "Work near a railway usually needs the railway's approval, flaggers and protective measures.",
  ),
];

/** Adds the review inputs to a template's catalog. */
export function withSiteReviews(t: ComponentTemplate): ComponentTemplate {
  return { ...t, paramCatalog: [...t.paramCatalog, ...SITE_REVIEW_PARAMS] };
}

/** Review params that apply to a component: only for the site flags it has. */
export function relevantReviews(flagCodes: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const code of flagCodes)
    if (REVIEW_PARAM[code]) out.add(REVIEW_PARAM[code]);
  return out;
}

/**
 * Applies reviews to the site allowances of one component: "no_measures"
 * drops the allowance line and downgrades the flag to an info note.
 */
export function applySiteReviews(
  site: { lines: LineItem[]; flags: Omit<Flag, "id">[] },
  params: Record<string, ParamValue>,
  evidence: (paramId: string) => string | undefined,
): { lines: LineItem[]; flags: Omit<Flag, "id">[] } {
  const settled = new Set(
    site.flags
      .filter((f) => {
        const p = REVIEW_PARAM[f.code];
        return p && params[p] === "no_measures";
      })
      .map((f) => f.code),
  );
  if (!settled.size) return site;
  const kindOf = (code: string) => code.replace(/^near_/, "");
  return {
    lines: site.lines.filter(
      (l) =>
        ![...settled].some((code) => l.id.endsWith(`:site-${kindOf(code)}`)),
    ),
    flags: site.flags.map((f) => {
      if (!settled.has(f.code)) return f;
      const src = evidence(REVIEW_PARAM[f.code]!);
      return {
        ...f,
        severity: "info" as const,
        title: t(f.title, L(": reviewed", " : examiné")),
        explanation: t(
          L(
            "Reviewed: no special measures needed, so no allowance is added.",
            "Examiné : aucune mesure particulière, aucune provision ajoutée.",
          ),
          src ? ` ${src}` : "",
        ),
        costEffect: undefined,
      };
    }),
  };
}
