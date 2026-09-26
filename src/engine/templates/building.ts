import type { LocalizedText, ParamDefinition, PriceRange } from "@/lib/schemas";
import { bool, num, str } from "../params";
import { L, t } from "../text";
import type {
  ComponentTemplate,
  PriceRef,
  QuantityLine,
  TemplateContext,
  TemplateFlag,
} from "../types";

// Buildings (SPEC 6.3): one or more freeform sections, each with its own storeys and roof.
// Building cost = Σ section GFA × $/m² × quality, plus visible lines for the
// sustainability premium, shape complexity, roofs, special spaces, and site works.
// Soft costs and FF&E are added at project level (P2.14).

const opt = (value: string, en: string, fr: string) => ({
  value,
  label: L(en, fr),
});

const paramCatalog: ParamDefinition[] = [
  {
    id: "quality",
    label: L("Quality level", "Niveau de qualité"),
    type: "enum",
    default: "standard",
    options: [
      opt("basic", "Basic", "De base"),
      opt("standard", "Standard", "Standard"),
      opt("high", "High", "Élevé"),
    ],
    costImpact: 4,
    why: L(
      "Finishes and systems scale the whole building cost.",
      "Les finis et systèmes font varier tout le coût du bâtiment.",
    ),
  },
  {
    id: "sustainability",
    label: L("Sustainability target", "Cible de durabilité"),
    type: "enum",
    default: "code_minimum",
    options: [
      opt("code_minimum", "Code minimum", "Minimum du code"),
      opt("high_performance", "High performance", "Haute performance"),
      opt("net_zero_ready", "Net-zero ready", "Prêt pour la carboneutralité"),
    ],
    costImpact: 3,
    why: L(
      "Better envelopes and systems add 5–10%.",
      "Une meilleure enveloppe et de meilleurs systèmes ajoutent de 5 à 10 %.",
    ),
  },
  {
    id: "gfaOverrideM2",
    label: L(
      "Gross floor area (override)",
      "Superficie brute de plancher (valeur imposée)",
    ),
    type: "number",
    unit: "m²",
    default: 0,
    min: 0,
    max: 200_000,
    costImpact: 5,
    why: L(
      "Leave at 0 to use the drawn sections.",
      "Laissez 0 pour utiliser les sections dessinées.",
    ),
  },
  {
    id: "basement",
    label: L("Basement", "Sous-sol"),
    type: "boolean",
    default: false,
    costImpact: 3,
    why: L(
      "A basement under the footprint adds excavation and structure.",
      "Un sous-sol sous l'emprise ajoute de l'excavation et de la structure.",
    ),
  },
  {
    id: "siteServicing",
    label: L("Site servicing complexity", "Complexité de la viabilisation"),
    type: "enum",
    default: "average",
    options: [
      opt("simple", "Simple", "Simple"),
      opt("average", "Average", "Moyenne"),
      opt("complex", "Complex", "Complexe"),
    ],
    costImpact: 3,
    why: L(
      "Distance to mains and upgrades needed drive servicing cost.",
      "La distance aux conduites et les mises à niveau déterminent le coût de viabilisation.",
    ),
  },
  {
    id: "parkingStalls",
    label: L("Surface parking stalls", "Places de stationnement en surface"),
    type: "number",
    default: 0,
    min: 0,
    max: 2000,
    costImpact: 2,
    why: L(
      "Used when no parking area is drawn; about 30 m² each.",
      "Utilisé si aucune aire n'est dessinée; environ 30 m² chacune.",
    ),
  },
  {
    id: "demolitionM2",
    label: L("Existing building to demolish", "Bâtiment existant à démolir"),
    type: "number",
    unit: "m²",
    default: 0,
    min: 0,
    max: 100_000,
    costImpact: 2,
    why: L(
      "Demolition and hazardous materials abatement.",
      "Démolition et désamiantage.",
    ),
  },
  {
    id: "ffeIncluded",
    label: L(
      "Furniture, fixtures and equipment",
      "Mobilier, agencements et équipement",
    ),
    type: "boolean",
    default: true,
    costImpact: 2,
    why: L(
      "FF&E is added as a soft cost when included.",
      "Le MAE est ajouté aux coûts indirects s'il est inclus.",
    ),
  },
  // Special spaces (SPEC 6.3)
  {
    id: "gymnasium",
    label: L("Gymnasium", "Gymnase"),
    type: "boolean",
    default: false,
    costImpact: 3,
    why: L("Tall, long-span space.", "Grand espace à longue portée."),
  },
  {
    id: "indoorPool",
    label: L("Indoor pool", "Piscine intérieure"),
    type: "boolean",
    default: false,
    costImpact: 5,
    why: L(
      "Pools are among the most expensive spaces.",
      "Les piscines sont parmi les espaces les plus coûteux.",
    ),
  },
  {
    id: "iceRink",
    label: L("Indoor ice rink", "Aréna intérieur"),
    type: "boolean",
    default: false,
    costImpact: 5,
    why: L(
      "Refrigeration and a large clear span.",
      "Réfrigération et grande portée libre.",
    ),
  },
  {
    id: "commercialKitchen",
    label: L("Commercial kitchen", "Cuisine commerciale"),
    type: "boolean",
    default: false,
    costImpact: 2,
    why: L("Equipment and ventilation.", "Équipement et ventilation."),
  },
  {
    id: "apparatusBays",
    label: L("Fire apparatus bays", "Baies pour véhicules d'incendie"),
    type: "number",
    default: 0,
    min: 0,
    max: 12,
    costImpact: 3,
    why: L(
      "Each bay adds heavy slabs, doors, and exhaust capture.",
      "Chaque baie ajoute dalle renforcée, portes et captage des gaz.",
    ),
  },
  {
    id: "sallyPort",
    label: L("Sally port and holding cells", "Sas véhiculaire et cellules"),
    type: "boolean",
    default: false,
    costImpact: 3,
    why: L(
      "Secure areas cost more to build.",
      "Les zones sécurisées coûtent plus cher à construire.",
    ),
  },
  {
    id: "councilChamber",
    label: L("Council chamber", "Salle du conseil"),
    type: "boolean",
    default: false,
    costImpact: 2,
    why: L(
      "A public assembly space with AV systems.",
      "Une salle publique avec systèmes audiovisuels.",
    ),
  },
  {
    id: "extraElevators",
    label: L("Additional elevators", "Ascenseurs supplémentaires"),
    type: "number",
    default: 0,
    min: 0,
    max: 12,
    costImpact: 2,
    why: L(
      "One elevator is included in multi-storey buildings.",
      "Un ascenseur est inclus dans les bâtiments à étages.",
    ),
  },
];

const SPECIAL_SPACES: {
  param: string;
  key: string;
  count: (v: number | boolean | string) => number;
}[] = [
  { param: "gymnasium", key: "gymnasium", count: (v) => (v ? 1 : 0) },
  { param: "indoorPool", key: "indoor_pool", count: (v) => (v ? 1 : 0) },
  { param: "iceRink", key: "ice_rink", count: (v) => (v ? 1 : 0) },
  {
    param: "commercialKitchen",
    key: "commercial_kitchen",
    count: (v) => (v ? 1 : 0),
  },
  {
    param: "apparatusBays",
    key: "apparatus_bay",
    count: (v) => (typeof v === "number" ? v : 0),
  },
  { param: "sallyPort", key: "sally_port_cells", count: (v) => (v ? 1 : 0) },
  {
    param: "councilChamber",
    key: "council_chamber",
    count: (v) => (v ? 1 : 0),
  },
  {
    param: "extraElevators",
    key: "elevator",
    count: (v) => (typeof v === "number" ? v : 0),
  },
];

const PARKING_STALL_M2 = 30;
/** Basement cost per m² as a share of the building's $/m². */
const BASEMENT_FACTOR = 0.7;
/** Share of building cost in the envelope, which is what shape complexity affects. */
const ENVELOPE_SHARE = 0.15;
/** Premium per extra section (distinct height/wing), capped. */
const PER_EXTRA_SECTION = 0.015;
const MAX_SECTION_PREMIUM = 0.06;
/** Default setback used to generate a site when none is drawn. */
export const DEFAULT_SETBACK_M = 6;
const BUILDING_SOURCE = L(
  "Sample Ontario building cost, 2025, per m² GFA",
  "Coût de bâtiment ontarien type (échantillon), 2025, par m² de SBP",
);
const SAMPLE_SOURCE = L(
  "Sample Ontario building cost, 2025",
  "Coût de bâtiment ontarien type (échantillon), 2025",
);

const round = (x: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};
const scale = (r: PriceRange, f: number): PriceRange => ({
  low: r.low * f,
  typical: r.typical * f,
  high: r.high * f,
});
/** Widens a range around its typical value (school and hospital uncertainty). */
const widen = (r: PriceRange, m: number): PriceRange => ({
  low: Math.max(0, r.typical - (r.typical - r.low) * m),
  typical: r.typical,
  high: r.typical + (r.high - r.typical) * m,
});
const direct = (
  description: LocalizedText,
  category: "building" | "site_works" | "demolition" | "landscaping",
  price: PriceRange,
  source: LocalizedText = SAMPLE_SOURCE,
): PriceRef => ({
  kind: "direct",
  description,
  category,
  priceCategory: "general",
  price,
  source,
});

/** Perimeter relative to a square of the same area: 1 for a square, higher for long or jagged shapes. */
export function shapeRatio(areaM2: number, perimeterM: number): number {
  return areaM2 > 0 ? perimeterM / (4 * Math.sqrt(areaM2)) : 1;
}

type SectionInfo = {
  id: string;
  label: string;
  storeys: number;
  roof: string;
  footprintM2: number;
  perimeterM: number;
  gfaM2: number;
};

function sectionInfo(ctx: TemplateContext): SectionInfo[] {
  return (ctx.component.geometry?.sections ?? []).map((s, i) => {
    const m = ctx.measurements.sections?.[s.id];
    return {
      id: s.id,
      label: s.use || `${i + 1}`,
      storeys: s.storeys,
      roof: s.roof,
      footprintM2: m?.footprintM2 ?? 0,
      perimeterM: m?.perimeterM ?? 0,
      gfaM2: m?.grossFloorAreaM2 ?? (m?.footprintM2 ?? 0) * s.storeys,
    };
  });
}

/** Site area: drawn site polygon, or the footprint plus a default setback all round. */
export function siteAreaM2(ctx: TemplateContext): {
  areaM2: number;
  generated: boolean;
} {
  if ((ctx.measurements.areaM2 ?? 0) > 0)
    return { areaM2: ctx.measurements.areaM2!, generated: false };
  const sections = sectionInfo(ctx);
  const footprint = sections.reduce((s, x) => s + x.footprintM2, 0);
  const perimeter = sections.reduce((s, x) => s + x.perimeterM, 0);
  const d = DEFAULT_SETBACK_M;
  return {
    areaM2: footprint + perimeter * d + Math.PI * d * d,
    generated: true,
  };
}

function parkingAreaM2(ctx: TemplateContext): {
  areaM2: number;
  drawn: boolean;
} {
  const drawn = (ctx.component.geometry?.features ?? [])
    .filter((f) => f.kind === "parking")
    .reduce((s, f) => s + (ctx.measurements.features[f.id]?.areaM2 ?? 0), 0);
  if (drawn > 0) return { areaM2: drawn, drawn: true };
  return {
    areaM2: num(ctx.params, "parkingStalls") * PARKING_STALL_M2,
    drawn: false,
  };
}

function deriveQuantities(ctx: TemplateContext): QuantityLine[] {
  const p = ctx.params;
  const costs = ctx.refData.buildingCosts;
  const sub = costs.subtypes[ctx.component.subtype];
  const sections = sectionInfo(ctx);
  if (!sub || sections.length === 0) return [];

  const drawnGfa = sections.reduce((s, x) => s + x.gfaM2, 0);
  const override = num(p, "gfaOverrideM2");
  const gfaScale = override > 0 && drawnGfa > 0 ? override / drawnGfa : 1;
  const totalGfa = round(drawnGfa * gfaScale);
  if (totalGfa <= 0) return [];

  const quality =
    costs.qualityFactors[str<"basic" | "standard" | "high">(p, "quality")];
  const rate = widen(scale(sub.perM2, quality), sub.uncertaintyMultiplier);
  const lines: QuantityLine[] = [];
  const push = (line: QuantityLine) => {
    if (line.quantity > 0) lines.push(line);
  };
  const qualityLabel = paramCatalog[0]!.options!.find(
    (o) => o.value === str(p, "quality"),
  )!.label;

  // --- Building sections ---
  for (const s of sections) {
    const gfa = round(s.gfaM2 * gfaScale);
    push({
      localId: `section:${s.id}`,
      price: direct(
        t(
          sub.label,
          L(" — section ", " — section "),
          s.label,
          " (",
          qualityLabel,
          ")",
        ),
        "building",
        rate,
        sub.source ?? BUILDING_SOURCE,
      ),
      quantity: gfa,
      unit: "m2",
      quantitySource:
        gfaScale === 1
          ? t(
              round(s.footprintM2),
              " m² × ",
              s.storeys,
              L(" storeys", " étages"),
            )
          : t(
              round(s.gfaM2),
              L(" m² drawn, scaled to the ", " m² dessinés, ajustés à "),
              override,
              L(" m² override", " m² imposés"),
            ),
      elementRef: { sectionId: s.id },
    });
  }

  // --- Sustainability premium ---
  const sustainability = str<keyof typeof costs.sustainabilityPremiums>(
    p,
    "sustainability",
  );
  const premium = costs.sustainabilityPremiums[sustainability] - 1;
  if (premium > 0) {
    push({
      localId: "sustainability",
      price: direct(
        t(
          paramCatalog[1]!.options!.find((o) => o.value === sustainability)!
            .label,
          L(" premium (", " — supplément ("),
          round(premium * 100, 1),
          "%)",
        ),
        "building",
        scale(rate, premium),
        sub.source
          ? t(
              sub.source,
              L(
                " + sample sustainability premium",
                " + prime de durabilité (échantillon)",
              ),
            )
          : BUILDING_SOURCE,
      ),
      quantity: totalGfa,
      unit: "m2",
      quantitySource: t(totalGfa, L(" m² GFA", " m² de SBP")),
    });
  }

  // --- Shape complexity (SPEC 6.3): envelope premium for non-compact sections + extra sections ---
  let complexity = 0;
  const ratios: string[] = [];
  for (const s of sections) {
    const r = shapeRatio(s.footprintM2, s.perimeterM);
    ratios.push(r.toFixed(2));
    complexity +=
      s.gfaM2 *
      gfaScale *
      rate.typical *
      ENVELOPE_SHARE *
      Math.min(1, Math.max(0, r - 1));
  }
  const sectionPremium = Math.min(
    MAX_SECTION_PREMIUM,
    PER_EXTRA_SECTION * (sections.length - 1),
  );
  complexity += totalGfa * rate.typical * sectionPremium;
  if (complexity > 0) {
    const c = round(complexity);
    push({
      localId: "shape_complexity",
      price: direct(
        t(
          L("Shape complexity (", "Complexité de la forme ("),
          sections.length,
          L(
            sections.length > 1 ? " sections)" : " section)",
            sections.length > 1 ? " sections)" : " section)",
          ),
        ),
        "building",
        { low: c * 0.7, typical: c, high: c * 1.4 },
      ),
      quantity: 1,
      unit: "lump",
      quantitySource: t(
        L(
          "Perimeter vs. square of equal area: ",
          "Périmètre par rapport à un carré de même aire : ",
        ),
        ratios.join(", "),
        L(`; ${sections.length} sections`, `; ${sections.length} sections`),
      ),
    });
  }

  // --- Roofs ---
  for (const s of sections) {
    if (s.roof !== "pitched" && s.roof !== "green") continue;
    const roofArea = round(s.footprintM2);
    push({
      localId: `roof:${s.id}`,
      price: {
        kind: "direct",
        description:
          s.roof === "green"
            ? L("Green roof premium", "Supplément toit vert")
            : L("Pitched roof premium", "Supplément toit en pente"),
        category: "building",
        priceCategory: s.roof === "pitched" ? "lumber" : "general",
        price: costs.roofPremiums[s.roof],
        source: SAMPLE_SOURCE,
      },
      quantity: roofArea,
      unit: "m2",
      quantitySource: t(
        roofArea,
        L(" m² roof, section ", " m² de toit, section "),
        s.label,
      ),
      elementRef: { sectionId: s.id },
    });
  }

  // --- Basement ---
  if (bool(p, "basement")) {
    const footprint = round(sections.reduce((s, x) => s + x.footprintM2, 0));
    push({
      localId: "basement",
      price: direct(
        L("Basement", "Sous-sol"),
        "building",
        scale(rate, BASEMENT_FACTOR),
        BUILDING_SOURCE,
      ),
      quantity: footprint,
      unit: "m2",
      quantitySource: t(
        footprint,
        L(" m² footprint × ", " m² d'emprise × "),
        BASEMENT_FACTOR * 100,
        L("% of building rate", " % du taux du bâtiment"),
      ),
    });
  }

  // --- Special spaces ---
  for (const s of SPECIAL_SPACES) {
    const count = s.count(p[s.param]!);
    const item = costs.specialSpaces[s.key];
    if (!item || count <= 0) continue;
    push({
      localId: `special:${s.key}`,
      price: direct(item.label, "building", item.price),
      quantity: count,
      unit: item.unit,
      quantitySource: t(count, " × ", item.label),
    });
  }

  // --- Site works ---
  const site = siteAreaM2(ctx);
  const siteArea = round(site.areaM2);
  const footprint = round(sections.reduce((s, x) => s + x.footprintM2, 0));
  const parking = parkingAreaM2(ctx);
  const parkingArea = round(parking.areaM2);
  const siteSrc = site.generated
    ? t(
        siteArea,
        L(
          ` m² site (footprint + ${DEFAULT_SETBACK_M} m setback)`,
          ` m² de terrain (emprise + marge de ${DEFAULT_SETBACK_M} m)`,
        ),
      )
    : t(siteArea, L(" m² site", " m² de terrain"));

  const unit = (
    localId: string,
    id: string,
    quantity: number,
    u: QuantityLine["unit"],
    src: LocalizedText,
  ) =>
    push({
      localId,
      price: { kind: "unitPrice", id },
      quantity,
      unit: u,
      quantitySource: src,
    });

  unit(
    "parking",
    "parking_lot_asphalt",
    parkingArea,
    "m2",
    parking.drawn
      ? t(parkingArea, L(" m² drawn", " m² dessinés"))
      : t(
          num(p, "parkingStalls"),
          L(" stalls × ", " places × "),
          PARKING_STALL_M2,
          " m²",
        ),
  );
  const landscape = Math.max(0, siteArea - footprint - parkingArea);
  unit(
    "landscaping",
    "site_landscaping",
    round(landscape),
    "m2",
    t(
      siteArea,
      " − ",
      footprint,
      L(" footprint − ", " emprise − "),
      parkingArea,
      L(" parking", " stationnement"),
    ),
  );
  unit("stormwater", "stormwater_management_site", siteArea, "m2", siteSrc);
  unit(
    "servicing",
    `site_servicing_${str(p, "siteServicing")}`,
    1,
    "lump",
    L("Site servicing allowance", "Provision pour viabilisation"),
  );
  const demo = num(p, "demolitionM2");
  unit(
    "demolition",
    "building_demolition",
    demo,
    "m2",
    t(demo, L(" m² existing building", " m² de bâtiment existant")),
  );
  unit(
    "hazmat",
    "hazmat_abatement",
    demo,
    "m2",
    t(demo, L(" m² existing building", " m² de bâtiment existant")),
  );

  return lines;
}

function flags(ctx: TemplateContext): TemplateFlag[] {
  const { component } = ctx;
  const out: TemplateFlag[] = [];
  const ids = [component.id];
  const sections = sectionInfo(ctx);

  if (component.subtype === "school" || component.subtype === "hospital") {
    out.push({
      code: "program_driven_cost",
      severity: "warning",
      title: L("Cost depends on the program", "Le coût dépend du programme"),
      explanation: L(
        "For schools and hospitals, cost depends mostly on the internal program (classrooms, labs, clinical spaces), not floor area. The range is wider to reflect this.",
        "Pour les écoles et les hôpitaux, le coût dépend surtout du programme intérieur (classes, laboratoires, espaces cliniques), pas de la superficie. La fourchette est plus large en conséquence.",
      ),
      componentIds: ids,
    });
  }
  if (sections.length === 0) return out;

  const site = siteAreaM2(ctx);
  const footprint = sections.reduce((s, x) => s + x.footprintM2, 0);
  const parking = parkingAreaM2(ctx).areaM2;
  if (!site.generated && footprint + parking > site.areaM2) {
    out.push({
      code: "building_does_not_fit",
      severity: "warning",
      title: L(
        "Building and parking don't fit the site",
        "Le bâtiment et le stationnement n'entrent pas sur le terrain",
      ),
      explanation: t(
        L(
          "Footprint and parking need ",
          "L'emprise et le stationnement exigent ",
        ),
        Math.round(footprint + parking),
        L(" m², but the site is ", " m², mais le terrain fait "),
        Math.round(site.areaM2),
        L(
          " m². Consider structured parking, more storeys, or a larger site.",
          " m². Envisagez un stationnement étagé, plus d'étages ou un terrain plus grand.",
        ),
      ),
      componentIds: ids,
    });
  }
  if (site.generated) {
    out.push({
      code: "site_generated",
      severity: "info",
      title: L("Site not drawn", "Terrain non dessiné"),
      explanation: t(
        L(
          "Site works assume the footprint plus a ",
          "Les travaux de terrain supposent l'emprise plus une marge de ",
        ),
        DEFAULT_SETBACK_M,
        L(
          " m setback. Draw the site for a better estimate.",
          " m. Dessinez le terrain pour une meilleure estimation.",
        ),
      ),
      componentIds: ids,
    });
  }
  if (num(ctx.params, "gfaOverrideM2") > 0) {
    const drawn = sections.reduce((s, x) => s + x.gfaM2, 0);
    const diff =
      drawn > 0
        ? Math.abs(num(ctx.params, "gfaOverrideM2") - drawn) / drawn
        : 0;
    if (diff > 0.25) {
      out.push({
        code: "gfa_override_mismatch",
        severity: "info",
        title: L(
          "Floor area differs from the drawing",
          "La superficie diffère du dessin",
        ),
        explanation: L(
          "The entered floor area differs from the drawn sections by more than 25%. The estimate uses the entered value.",
          "La superficie saisie diffère de plus de 25 % des sections dessinées. L'estimation utilise la valeur saisie.",
        ),
        componentIds: ids,
      });
    }
  }
  return out;
}

export const buildingTemplate: ComponentTemplate = {
  type: "building",
  subtypes: [
    {
      id: "community_centre",
      label: L("Community centre", "Centre communautaire"),
    },
    { id: "library", label: L("Library", "Bibliothèque") },
    { id: "fire_station", label: L("Fire station", "Caserne de pompiers") },
    { id: "police_station", label: L("Police station", "Poste de police") },
    {
      id: "municipal_office",
      label: L("Municipal office", "Bureau municipal"),
    },
    { id: "school", label: L("School (rough)", "École (approximatif)") },
    { id: "hospital", label: L("Hospital (rough)", "Hôpital (approximatif)") },
    { id: "house", label: L("Single-detached house", "Maison individuelle") },
    {
      id: "townhouse_block",
      label: L("Townhouse block", "Rangée de maisons en bande"),
    },
    {
      id: "low_rise_apartment",
      label: L("Low-rise apartment", "Immeuble de faible hauteur"),
    },
    {
      id: "mid_rise_apartment",
      label: L("Mid-rise apartment", "Immeuble de hauteur moyenne"),
    },
  ],
  paramCatalog,
  subtypeDefaults: {
    community_centre: { gymnasium: true, parkingStalls: 60 },
    library: { parkingStalls: 30 },
    fire_station: { apparatusBays: 3, parkingStalls: 20 },
    police_station: { sallyPort: true, parkingStalls: 40 },
    municipal_office: { councilChamber: true, parkingStalls: 60 },
    school: { gymnasium: true, parkingStalls: 50 },
    hospital: { parkingStalls: 300, siteServicing: "complex" },
    house: { ffeIncluded: false, siteServicing: "simple" },
    townhouse_block: { ffeIncluded: false },
    low_rise_apartment: { ffeIncluded: false },
    mid_rise_apartment: { ffeIncluded: false },
  },
  deriveQuantities,
  flags,
};
