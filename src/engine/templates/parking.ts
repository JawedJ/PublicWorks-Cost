import type { ParamDefinition } from "@/lib/schemas";
import { bool, num, str } from "../params";
import { L, t } from "../text";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
  TemplateFlag,
} from "../types";

// Parking lots (own component, per the human; buildings no longer include parking by
// default). The drawn polygon gives area A and perimeter P. Stalls are derived from
// area (about 30 m² per stall including aisles) unless entered. Extras are off
// unless specified.

/** Area per stall including drive aisles (m²). */
export const PARKING_STALL_M2 = 30;
/** One light pole per this much lot area (m²). */
const LIGHT_EVERY_M2 = 600;
/** One catch basin per this much paved area (m²). */
const CATCH_BASIN_EVERY_M2 = 800;
/** Lots at or above this size usually need an oil-grit separator (m²). */
const OGS_FROM_M2 = 2_000;
/** Pavement markings per stall (m of line). */
const MARKING_M_PER_STALL = 6;

const opt = (value: string, en: string, fr: string) => ({
  value,
  label: L(en, fr),
});

const paramCatalog: ParamDefinition[] = [
  {
    id: "surface",
    label: L("Surface", "Revêtement"),
    type: "enum",
    default: "asphalt",
    options: [
      opt("asphalt", "Asphalt", "Asphalte"),
      opt("permeable", "Permeable pavers", "Pavés perméables"),
    ],
    costImpact: 4,
    why: L(
      "Permeable pavers cost more per m² but reduce stormwater works.",
      "Les pavés perméables coûtent plus par m² mais réduisent les ouvrages pluviaux.",
    ),
  },
  {
    id: "stalls",
    label: L("Parking stalls", "Places de stationnement"),
    type: "number",
    default: 0,
    min: 0,
    max: 5000,
    costImpact: 2,
    why: L(
      "Leave at 0 to estimate from the drawn area (about 30 m² per stall).",
      "Laisser à 0 pour estimer à partir de la surface dessinée (environ 30 m² par place).",
    ),
  },
  {
    id: "curbs",
    label: L("Concrete curbs around the lot", "Bordures de béton autour du stationnement"),
    type: "boolean",
    default: true,
    costImpact: 2,
    why: L(
      "Curbs are priced per metre of perimeter.",
      "Les bordures sont évaluées au mètre de périmètre.",
    ),
  },
  {
    id: "lighting",
    label: L("Lighting", "Éclairage"),
    type: "boolean",
    default: false,
    costImpact: 3,
    why: L(
      "About one light pole per 600 m² of lot.",
      "Environ un lampadaire par 600 m² de stationnement.",
    ),
  },
  {
    id: "evChargers",
    label: L("EV chargers", "Bornes de recharge"),
    type: "number",
    default: 0,
    min: 0,
    max: 200,
    costImpact: 2,
    why: L(
      "Each Level 2 charger adds equipment, electrical and trenching.",
      "Chaque borne de niveau 2 ajoute l'équipement, l'électricité et la tranchée.",
    ),
  },
];

/** Level 2 EV charger, installed (sample allowance). */
const EV_CHARGER = { low: 9_000, typical: 14_000, high: 22_000 };

function deriveQuantities(ctx: TemplateContext): QuantityLine[] {
  const A = Math.round(ctx.measurements.areaM2 ?? 0);
  const P = Math.round(ctx.measurements.perimeterM ?? 0);
  if (A <= 0) return [];
  const p = ctx.params;
  const permeable = str(p, "surface") === "permeable";
  const stalls = num(p, "stalls") || Math.floor(A / PARKING_STALL_M2);
  const lines: QuantityLine[] = [
    {
      localId: "grading",
      price: { kind: "unitPrice", id: "grading_rough_fine" },
      quantity: A,
      unit: "m2",
      quantitySource: t(A, L(" m² lot area", " m² de stationnement")),
    },
    {
      localId: "surface",
      price: {
        kind: "unitPrice",
        id: permeable ? "permeable_pavers" : "parking_lot_asphalt",
      },
      quantity: A,
      unit: "m2",
      quantitySource: t(A, L(" m² lot area", " m² de stationnement")),
    },
    {
      localId: "markings",
      price: { kind: "unitPrice", id: "pavement_markings" },
      quantity: stalls * MARKING_M_PER_STALL,
      unit: "m",
      quantitySource: t(
        stalls,
        L(" stalls × ", " places × "),
        MARKING_M_PER_STALL,
        L(" m of line", " m de ligne"),
        num(p, "stalls")
          ? ""
          : L(
              ` (stalls estimated at ${PARKING_STALL_M2} m² each)`,
              ` (places estimées à ${PARKING_STALL_M2} m² chacune)`,
            ),
      ),
    },
  ];
  if (!permeable) {
    const basins = Math.max(1, Math.ceil(A / CATCH_BASIN_EVERY_M2));
    lines.push({
      localId: "catch-basins",
      price: { kind: "unitPrice", id: "catch_basin" },
      quantity: basins,
      unit: "each",
      quantitySource: t(
        L("1 per ", "1 par "),
        CATCH_BASIN_EVERY_M2,
        L(" m² of pavement", " m² de chaussée"),
      ),
    });
    if (A >= OGS_FROM_M2)
      lines.push({
        localId: "ogs",
        price: { kind: "unitPrice", id: "stormwater_ogs" },
        quantity: 1,
        unit: "each",
        quantitySource: t(
          L("Paved lot of ", "Stationnement pavé de "),
          OGS_FROM_M2,
          L(" m² or more", " m² ou plus"),
        ),
      });
  }
  if (bool(p, "curbs") && P > 0)
    lines.push({
      localId: "curbs",
      price: { kind: "unitPrice", id: "curb_barrier" },
      quantity: P,
      unit: "m",
      quantitySource: t(P, L(" m perimeter", " m de périmètre")),
    });
  if (bool(p, "lighting")) {
    const poles = Math.max(1, Math.ceil(A / LIGHT_EVERY_M2));
    lines.push(
      {
        localId: "light-poles",
        price: { kind: "unitPrice", id: "streetlight_pole" },
        quantity: poles,
        unit: "each",
        quantitySource: t(
          L("1 per ", "1 par "),
          LIGHT_EVERY_M2,
          L(" m² of lot", " m² de stationnement"),
        ),
      },
      {
        localId: "light-cable",
        price: { kind: "unitPrice", id: "streetlight_cable" },
        quantity: P,
        unit: "m",
        quantitySource: t(P, L(" m perimeter run", " m le long du périmètre")),
      },
    );
  }
  const ev = num(p, "evChargers");
  if (ev > 0)
    lines.push({
      localId: "ev-chargers",
      price: {
        kind: "direct",
        description: L(
          "EV charger, Level 2, installed",
          "Borne de recharge de niveau 2, installée",
        ),
        category: "site_works",
        priceCategory: "general",
        price: EV_CHARGER,
        source: L(
          "Engine allowance (sample), Level 2 charger with electrical",
          "Provision du moteur (échantillon), borne de niveau 2 avec électricité",
        ),
        lowConfidence: true,
      },
      quantity: ev,
      unit: "each",
      quantitySource: t(ev, L(" chargers entered", " bornes saisies")),
    });
  return lines;
}

function flags(ctx: TemplateContext): TemplateFlag[] {
  const A = ctx.measurements.areaM2 ?? 0;
  const out: TemplateFlag[] = [];
  if (A >= 5_000 && str(ctx.params, "surface") !== "permeable")
    out.push({
      code: "parking_stormwater",
      severity: "info",
      title: L(
        "Large paved lot: stormwater approval",
        "Grand stationnement pavé : approbation des eaux pluviales",
      ),
      explanation: L(
        "Paved lots this size usually need stormwater quantity and quality control (and an approval) beyond the oil-grit separator included here.",
        "Les stationnements pavés de cette taille exigent généralement un contrôle quantitatif et qualitatif des eaux pluviales (et une approbation) au-delà du séparateur inclus ici.",
      ),
      componentIds: [ctx.component.id],
    });
  return out;
}

export const parkingTemplate: ComponentTemplate = {
  type: "parking",
  subtypes: [
    { id: "surface_lot", label: L("Surface parking lot", "Stationnement de surface") },
  ],
  paramCatalog,
  deriveQuantities,
  flags,
};
