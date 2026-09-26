import type {
  CustomPricing,
  Measurements,
  RefData,
  LocalizedText,
} from "@/lib/schemas";
import { L, t } from "../text";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
} from "../types";

// Custom elements (SPEC 6.5): priced by a matched seed-data basis or the user's own rate,
// always low-confidence with a wide default band.

/** Default band when the user gives no low/high: −30% / +60%. */
export const CUSTOM_BAND = { low: 0.7, high: 1.6 };

function quantityFor(
  unit: string,
  m: { lengthM?: number; areaM2?: number; perimeterM?: number },
) {
  if (unit === "m") return Math.round(m.lengthM ?? m.perimeterM ?? 0);
  if (unit === "m2") return Math.round(m.areaM2 ?? 0);
  return 1;
}

/** A known cost a custom element can be matched to (SPEC 6.5). */
export type CustomBasis = {
  /** `building:<subtype>`, a park feature kind, or a unit-prices.json id. */
  id: string;
  group: "building" | "park" | "unit_price";
  label: LocalizedText;
  unit: "m" | "m2" | "each";
  typical: number;
  source?: LocalizedText;
};

const BUILDING_PREFIX = "building:";
const CUSTOM_UNITS = new Set(["m", "m2", "each"]);

const basesCache = new WeakMap<RefData, CustomBasis[]>();

/** Every basis a custom element can be matched to: building rates, park features, unit prices. */
export function customBases(refData: RefData): CustomBasis[] {
  const hit = basesCache.get(refData);
  if (hit) return hit;
  const out: CustomBasis[] = [];
  for (const [id, b] of Object.entries(refData.buildingCosts.subtypes)) {
    out.push({
      id: BUILDING_PREFIX + id,
      group: "building",
      label: t(b.label, L(" (per m² of floor area)", " (par m² de plancher)")),
      unit: "m2",
      typical: b.perM2.typical,
      source: b.source,
    });
  }
  for (const [id, f] of Object.entries(refData.parkFeatures.features)) {
    const typical = Object.values(f.tiers)[0]?.typical;
    if (typical === undefined || !CUSTOM_UNITS.has(f.unit)) continue;
    out.push({
      id,
      group: "park",
      label: f.label,
      unit: f.unit as CustomBasis["unit"],
      typical,
    });
  }
  for (const i of refData.unitPrices.items) {
    if (!CUSTOM_UNITS.has(i.unit)) continue;
    out.push({
      id: i.id,
      group: "unit_price",
      label: i.description,
      unit: i.unit as CustomBasis["unit"],
      typical: i.price.typical,
    });
  }
  basesCache.set(refData, out);
  return out;
}

/** When nothing matches by name: general site landscaping per m² (wide band, low confidence). */
export const GENERIC_BASIS_ID = "site_landscaping";

/**
 * Price for a custom element nobody has priced yet: the best match by name, else
 * the generic basis. Plain code; the engine uses it so nothing is silently $0.
 */
export function autoPricing(
  name: string,
  refData: RefData,
): Extract<CustomPricing, { mode: "matched" }> | undefined {
  const bases = customBases(refData);
  const b =
    suggestBasis(name, bases) ?? bases.find((x) => x.id === GENERIC_BASIS_ID);
  return (
    b && { mode: "matched", basisId: b.id, unit: b.unit, suggestedByAi: false }
  );
}

function findBasis(refData: RefData, id: string): CustomBasis | undefined {
  return customBases(refData).find((b) => b.id === id);
}

/** Words that point at a basis even when the label doesn't share them. */
const SYNONYMS: Record<string, string> = {
  pool: "aquatic",
  swimming: "aquatic",
  natatorium: "aquatic",
  arena: "arena",
  hockey: "arena",
  theatre: "performing",
  theater: "performing",
  auditorium: "performing",
  concert: "performing",
  gallery: "gallery",
  museum: "museum",
  clinic: "clinic",
  health: "clinic",
  yard: "maintenance",
  depot: "maintenance",
  garage: "maintenance",
  boardwalk: "trail",
  path: "trail",
  pathway: "trail",
  skate: "skate",
  gazebo: "shade",
  pavilion: "shade",
  court: "court",
  garden: "garden",
  rink: "rink",
};

/** Generic words that say little about the cost basis. */
const STOP = new Set([
  "community",
  "municipal",
  "public",
  "new",
  "centre",
  "center",
  "city",
  "town",
  "building",
  "area",
  "the",
  "and",
  "per",
  "floor",
  // Would match sewer "maintenance hole" or nothing useful ("18 hole golf course").
  "hole",
  "course",
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w));

/** Best keyword match for a custom element's name, or null. Plain code, no AI. */
export function suggestBasis(
  name: string,
  bases: CustomBasis[],
): CustomBasis | null {
  // Synonym hits count double: "pool" → aquatic is a stronger signal than a shared word.
  const weight = new Map<string, number>();
  for (const w of words(name)) {
    weight.set(w, Math.max(weight.get(w) ?? 0, 1));
    const syn = SYNONYMS[w];
    if (syn) weight.set(syn, 2);
  }
  let best: CustomBasis | null = null;
  let bestScore = 0;
  for (const b of bases) {
    const score = words(b.label.en).reduce(
      (sum, w) => sum + (weight.get(w) ?? 0),
      0,
    );
    if (score > bestScore) {
      best = b;
      bestScore = score;
    }
  }
  return best;
}

/** One line for a custom component or custom park feature, or null if it can't be priced. */
export function customLine(
  localId: string,
  name: string,
  pricing: CustomPricing | undefined,
  m: Pick<Measurements, "lengthM" | "areaM2" | "perimeterM">,
  refData: RefData,
  elementRef?: QuantityLine["elementRef"],
): QuantityLine | null {
  // Not priced by anyone yet: match automatically (flagged for review).
  const auto = !pricing;
  pricing ??= autoPricing(name, refData);
  if (!pricing) return null;
  const quantity = quantityFor(pricing.unit, m);
  if (quantity <= 0) return null;
  let typical: number;
  let low: number;
  let high: number;
  let source: LocalizedText;
  if (pricing.mode === "own_rate") {
    typical = pricing.rate;
    low = pricing.low ?? typical * CUSTOM_BAND.low;
    high = pricing.high ?? typical * CUSTOM_BAND.high;
    source = L("User-entered rate", "Taux saisi par l'utilisateur");
  } else {
    const basis = findBasis(refData, pricing.basisId);
    if (!basis) return null;
    typical = basis.typical;
    low = typical * CUSTOM_BAND.low;
    high = typical * CUSTOM_BAND.high;
    const how = auto
      ? L("Auto-matched by name to ", "Associé automatiquement à ")
      : pricing.suggestedByAi
        ? L("Matched by AI to ", "Associé par l'IA à ")
        : L("Matched to ", "Associé à ");
    source = basis.source
      ? t(how, basis.label, " — ", basis.source)
      : t(how, basis.label);
  }
  return {
    localId,
    price: {
      kind: "direct",
      description: t(name, L(" (custom)", " (personnalisé)")),
      category: "custom",
      priceCategory: "general",
      price: { low, typical, high },
      source,
      lowConfidence: true,
    },
    quantity,
    unit: pricing.unit,
    quantitySource: t(quantity, " ", pricing.unit),
    elementRef,
  };
}

export const customTemplate: ComponentTemplate = {
  type: "custom",
  subtypes: [
    { id: "custom", label: L("Custom element", "Élément personnalisé") },
  ],
  paramCatalog: [],
  deriveQuantities: (ctx: TemplateContext) => {
    const line = customLine(
      "custom",
      ctx.component.name,
      ctx.component.customPricing,
      ctx.measurements,
      ctx.refData,
    );
    return line ? [line] : [];
  },
  flags: ({ component, refData }) => {
    const p = component.customPricing;
    if (p && !(p.mode === "matched" && p.suggestedByAi)) return [];
    const matched = p ?? autoPricing(component.name, refData);
    const basis = matched && findBasis(refData, matched.basisId);
    if (!basis)
      return [
        {
          code: "custom_not_priced",
          severity: "warning",
          title: L(
            "Custom element has no price",
            "Élément personnalisé sans prix",
          ),
          explanation: L(
            "Choose a matched cost basis or enter your own rate.",
            "Choisissez une base de coût ou saisissez votre propre taux.",
          ),
          componentIds: [component.id],
        },
      ];
    return [
      {
        code: "custom_auto_priced",
        severity: "warning",
        title: L(
          "Custom element priced automatically",
          "Élément personnalisé chiffré automatiquement",
        ),
        explanation: t(
          L("Priced as ", "Chiffré comme "),
          basis.label,
          L(
            " (closest match in the cost data; low confidence). Confirm or change it in Inputs.",
            " (correspondance la plus proche; confiance faible). Confirmez ou modifiez-le dans Paramètres.",
          ),
        ),
        componentIds: [component.id],
      },
    ];
  },
};
