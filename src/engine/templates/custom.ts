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

/** One line for a custom component or custom park feature, or null if it can't be priced. */
export function customLine(
  localId: string,
  name: string,
  pricing: CustomPricing | undefined,
  m: Pick<Measurements, "lengthM" | "areaM2" | "perimeterM">,
  refData: RefData,
  elementRef?: QuantityLine["elementRef"],
): QuantityLine | null {
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
    const unitItem = refData.unitPrices.items.find(
      (i) => i.id === pricing.basisId,
    );
    const park = refData.parkFeatures.features[pricing.basisId];
    const basis =
      unitItem?.price.typical ??
      (park ? Object.values(park.tiers)[0]?.typical : undefined);
    if (basis === undefined) return null;
    typical = basis;
    low = basis * CUSTOM_BAND.low;
    high = basis * CUSTOM_BAND.high;
    source = t(
      L("Matched to ", "Associé à "),
      unitItem?.description ?? park!.label,
    );
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
  flags: ({ component }) =>
    component.customPricing
      ? []
      : [
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
        ],
};
