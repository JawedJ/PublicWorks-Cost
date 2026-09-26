import type { ParamDefinition } from "@/lib/schemas";
import { bool, num, str } from "../params";
import { L, t } from "../text";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
  TemplateFlag,
} from "../types";

// Structures (SPEC 6.4): culverts, small bridges, pumping stations, priced from structures.json.

const opt = (value: string, en: string, fr: string) => ({
  value,
  label: L(en, fr),
});
const why = L(
  "Drives the structure's size and type.",
  "Détermine la taille et le type de la structure.",
);

const paramCatalog: ParamDefinition[] = [
  {
    id: "spanM",
    label: L("Culvert span", "Portée du ponceau"),
    type: "number",
    unit: "m",
    default: 3,
    min: 1,
    max: 6,
    costImpact: 4,
    why,
  },
  {
    id: "lengthM",
    label: L("Culvert length", "Longueur du ponceau"),
    type: "number",
    unit: "m",
    default: 20,
    min: 5,
    max: 100,
    costImpact: 4,
    why,
  },
  {
    id: "fishHabitat",
    label: L("Fish habitat", "Habitat du poisson"),
    type: "boolean",
    default: false,
    costImpact: 3,
    why: L(
      "In-water work needs permits, timing windows, and fish rescue.",
      "Les travaux en eau exigent permis, périodes restreintes et sauvetage des poissons.",
    ),
  },
  {
    id: "deckLengthM",
    label: L("Bridge deck length", "Longueur du tablier"),
    type: "number",
    unit: "m",
    default: 20,
    min: 5,
    max: 200,
    costImpact: 5,
    why,
  },
  {
    id: "deckWidthM",
    label: L("Bridge deck width", "Largeur du tablier"),
    type: "number",
    unit: "m",
    default: 10,
    min: 2,
    max: 40,
    costImpact: 5,
    why,
  },
  {
    id: "structureType",
    label: L("Bridge type", "Type de pont"),
    type: "enum",
    default: "concrete_girder",
    options: [
      opt("concrete_girder", "Concrete girders", "Poutres en béton"),
      opt("steel_girder", "Steel girders", "Poutres en acier"),
      opt("slab", "Concrete slab", "Dalle de béton"),
      opt("pedestrian", "Pedestrian bridge", "Passerelle piétonne"),
    ],
    costImpact: 3,
    why,
  },
  {
    id: "capacityTier",
    label: L("Pumping station capacity", "Capacité de la station de pompage"),
    type: "enum",
    default: "small",
    options: [
      opt("small", "Up to 50 L/s", "Jusqu'à 50 L/s"),
      opt("medium", "50–200 L/s", "50 à 200 L/s"),
      opt("large", "Over 200 L/s", "Plus de 200 L/s"),
    ],
    costImpact: 5,
    why,
  },
  {
    id: "trafficMonths",
    label: L("Months of traffic control", "Mois de signalisation"),
    type: "number",
    default: 3,
    min: 0,
    max: 24,
    costImpact: 2,
    why: L(
      "Road structures keep traffic moving during work.",
      "Les structures routières maintiennent la circulation pendant les travaux.",
    ),
  },
];

const CULVERT_SIZES: [number, string][] = [
  [1.2, "culvert_cmp_1200"],
  [1.8, "culvert_concrete_pipe_1800"],
  [2.4, "culvert_box_2400"],
  [3, "culvert_box_3000"],
  [4.2, "culvert_box_4200"],
  [6, "culvert_open_footing_6000"],
];
const BRIDGE_ITEM: Record<string, string> = {
  concrete_girder: "bridge_deck_concrete_girder",
  steel_girder: "bridge_deck_steel_girder",
  slab: "bridge_deck_slab",
  pedestrian: "bridge_pedestrian",
};

function deriveQuantities(ctx: TemplateContext): QuantityLine[] {
  const p = ctx.params;
  const items = new Map(ctx.refData.structures.items.map((i) => [i.id, i]));
  const lines: QuantityLine[] = [];
  const struct = (
    localId: string,
    id: string,
    quantity: number,
    src: QuantityLine["quantitySource"],
  ) => {
    const i = items.get(id);
    if (!i || quantity <= 0) return;
    lines.push({
      localId,
      price: {
        kind: "direct",
        description: i.description,
        category: "structures",
        priceCategory: i.priceCategory,
        price: i.price,
        source: L(
          "Sample Ontario structure price, 2025",
          "Prix type ontarien de structure (échantillon), 2025",
        ),
      },
      quantity,
      unit: i.unit,
      quantitySource: src,
    });
  };
  const unit = (
    localId: string,
    id: string,
    quantity: number,
    u: QuantityLine["unit"],
    src: QuantityLine["quantitySource"],
  ) => {
    if (quantity > 0)
      lines.push({
        localId,
        price: { kind: "unitPrice", id },
        quantity,
        unit: u,
        quantitySource: src,
      });
  };

  switch (ctx.component.subtype) {
    case "culvert_replacement": {
      const span = num(p, "spanM");
      const id = (CULVERT_SIZES.find(([s]) => s >= span) ??
        CULVERT_SIZES.at(-1)!)[1];
      struct(
        "culvert",
        id,
        num(p, "lengthM"),
        t(
          num(p, "lengthM"),
          L(" m long, span ", " m de long, portée "),
          span,
          " m",
        ),
      );
      struct("headwalls", "culvert_headwalls", 1, L("1 pair", "1 paire"));
      unit(
        "structure_removal",
        "structure_removal",
        1,
        "lump",
        L("Existing culvert", "Ponceau existant"),
      );
      break;
    }
    case "small_bridge": {
      // A bridge drawn as a line uses its length as the deck length.
      const len = Math.round(ctx.measurements.lengthM ?? num(p, "deckLengthM"));
      const area = Math.round(len * num(p, "deckWidthM"));
      struct(
        "deck",
        BRIDGE_ITEM[str(p, "structureType")]!,
        area,
        t(len, " m × ", num(p, "deckWidthM"), L(" m deck", " m de tablier")),
      );
      struct(
        "approaches",
        "bridge_approaches",
        1,
        L("Approaches and barriers", "Approches et glissières"),
      );
      break;
    }
    case "pumping_station": {
      struct(
        "station",
        `pumping_station_${str(p, "capacityTier")}`,
        1,
        L("1 station", "1 station"),
      );
      break;
    }
  }
  if (ctx.component.subtype !== "pumping_station") {
    if (bool(p, "fishHabitat") || ctx.component.subtype === "small_bridge") {
      unit(
        "in_water",
        "in_water_work",
        1,
        "lump",
        L("Work in or near water", "Travaux dans l'eau ou à proximité"),
      );
    }
    unit(
      "traffic_control",
      "traffic_control_staged",
      num(p, "trafficMonths"),
      "month",
      t(num(p, "trafficMonths"), L(" months", " mois")),
    );
  }
  return lines;
}

function flags({ component, params }: TemplateContext): TemplateFlag[] {
  if (
    component.subtype === "pumping_station" ||
    !(bool(params, "fishHabitat") || component.subtype === "small_bridge")
  )
    return [];
  return [
    {
      code: "in_water_permit",
      severity: "warning",
      title: L("In-water work permit", "Permis de travaux en eau"),
      explanation: L(
        "Work in a watercourse needs conservation authority approval and is limited to timing windows.",
        "Les travaux dans un cours d'eau exigent l'approbation de l'office de protection de la nature et sont limités à certaines périodes.",
      ),
      componentIds: [component.id],
    },
  ];
}

export const structureTemplate: ComponentTemplate = {
  type: "structure",
  subtypes: [
    {
      id: "culvert_replacement",
      label: L("Culvert replacement", "Remplacement de ponceau"),
    },
    { id: "small_bridge", label: L("Small bridge", "Petit pont") },
    {
      id: "pumping_station",
      label: L("Pumping station", "Station de pompage"),
    },
  ],
  paramCatalog,
  deriveQuantities,
  flags,
};
