import type { ParamDefinition } from "@/lib/schemas";
import { bool, num, str } from "../params";
import { L, t } from "../text";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
  TemplateFlag,
} from "../types";

// Roads & utilities (SPEC 6.1). Drawn as a line; quantities scale with its length L.
// Pipe unit prices include trench excavation, bedding, and backfill.

type RoadClass = "local" | "collector" | "arterial";
type Scope = "full_reconstruction" | "mill_and_pave" | "none";
type Staging = "full_closure" | "staged" | "night_work";
type Soil = "good" | "average" | "poor" | "unknown";
type Cycling = "none" | "painted_lane" | "cycle_track";

const opt = (value: string, en: string, fr: string) => ({
  value,
  label: L(en, fr),
});

const paramCatalog: ParamDefinition[] = [
  {
    id: "scope",
    label: L("Road work scope", "Portée des travaux de chaussée"),
    type: "enum",
    default: "full_reconstruction",
    options: [
      opt(
        "full_reconstruction",
        "Full reconstruction",
        "Reconstruction complète",
      ),
      opt("mill_and_pave", "Mill and pave", "Planage et resurfaçage"),
      opt(
        "none",
        "No road work (trench restoration only)",
        "Aucuns travaux de chaussée (restauration de tranchée seulement)",
      ),
    ],
    costImpact: 5,
    why: L(
      "Rebuilding the whole road costs several times more than resurfacing it.",
      "Reconstruire toute la chaussée coûte plusieurs fois plus que la resurfacer.",
    ),
  },
  {
    id: "lanes",
    label: L("Travel lanes", "Voies de circulation"),
    type: "number",
    default: 2,
    min: 1,
    max: 8,
    costImpact: 4,
    why: L(
      "Road width drives paving and excavation.",
      "La largeur de la chaussée détermine le pavage et l'excavation.",
    ),
  },
  {
    id: "laneWidthM",
    label: L("Lane width", "Largeur de voie"),
    type: "number",
    unit: "m",
    default: 3.5,
    min: 2.75,
    max: 4.5,
    costImpact: 2,
    why: L(
      "Wider lanes mean more pavement.",
      "Des voies plus larges signifient plus de pavage.",
    ),
  },
  {
    id: "parkingLanes",
    label: L("Parking lanes", "Voies de stationnement"),
    type: "number",
    default: 0,
    min: 0,
    max: 2,
    costImpact: 2,
    why: L(
      "Each parking lane adds 2.4 m of pavement.",
      "Chaque voie de stationnement ajoute 2,4 m de pavage.",
    ),
  },
  {
    id: "roadClass",
    label: L("Road class", "Catégorie de route"),
    type: "enum",
    default: "local",
    options: [
      opt("local", "Local", "Locale"),
      opt("collector", "Collector", "Collectrice"),
      opt("arterial", "Arterial", "Artère"),
    ],
    costImpact: 3,
    why: L(
      "Busier roads need a thicker pavement structure and more traffic control.",
      "Les routes plus achalandées exigent une structure de chaussée plus épaisse et plus de signalisation.",
    ),
  },
  {
    id: "curbs",
    label: L("Curb and gutter", "Bordure et caniveau"),
    type: "boolean",
    default: true,
    costImpact: 2,
    why: L(
      "Curbs run both sides of the full length.",
      "Les bordures s'étendent des deux côtés sur toute la longueur.",
    ),
  },
  {
    id: "sidewalkSides",
    label: L("Sidewalks (sides)", "Trottoirs (côtés)"),
    type: "number",
    default: 2,
    min: 0,
    max: 2,
    costImpact: 3,
    why: L(
      "Sidewalks are a large share of a local street's cost.",
      "Les trottoirs représentent une grande part du coût d'une rue locale.",
    ),
  },
  {
    id: "sidewalkWidthM",
    label: L("Sidewalk width", "Largeur du trottoir"),
    type: "number",
    unit: "m",
    default: 1.8,
    min: 1.5,
    max: 4,
    costImpact: 2,
    why: L(
      "Wider sidewalks mean more concrete.",
      "Des trottoirs plus larges signifient plus de béton.",
    ),
  },
  {
    id: "cycling",
    label: L("Cycling facility", "Aménagement cyclable"),
    type: "enum",
    default: "none",
    options: [
      opt("none", "None", "Aucun"),
      opt("painted_lane", "Painted bike lanes", "Bandes cyclables peintes"),
      opt("cycle_track", "Separated cycle track", "Piste cyclable séparée"),
    ],
    costImpact: 3,
    why: L(
      "Painted lanes widen the road; a cycle track adds its own paved surface.",
      "Les bandes peintes élargissent la chaussée; une piste séparée ajoute sa propre surface.",
    ),
  },
  {
    id: "watermain",
    label: L("Replace watermain", "Remplacer la conduite d'eau"),
    type: "boolean",
    default: true,
    costImpact: 5,
    why: L(
      "Underground work is often the biggest part of a street rebuild.",
      "Les travaux souterrains sont souvent la plus grande part d'une reconstruction de rue.",
    ),
  },
  {
    id: "watermainDiameterMm",
    label: L("Watermain diameter", "Diamètre de la conduite d'eau"),
    type: "number",
    unit: "mm",
    default: 200,
    min: 150,
    max: 400,
    costImpact: 3,
    why: L(
      "Larger pipe costs more per metre.",
      "Un tuyau plus gros coûte plus par mètre.",
    ),
  },
  {
    id: "watermainMaterial",
    label: L("Watermain material", "Matériau de la conduite d'eau"),
    type: "enum",
    default: "pvc",
    options: [
      opt("pvc", "PVC", "PVC"),
      opt("ductile_iron", "Ductile iron", "Fonte ductile"),
    ],
    costImpact: 2,
    why: L(
      "Ductile iron costs more than PVC.",
      "La fonte ductile coûte plus que le PVC.",
    ),
  },
  {
    id: "stormSewer",
    label: L("Replace storm sewer", "Remplacer l'égout pluvial"),
    type: "boolean",
    default: true,
    costImpact: 4,
    why: L(
      "Storm sewers include catch basins and maintenance holes.",
      "Les égouts pluviaux comprennent puisards et regards.",
    ),
  },
  {
    id: "stormDiameterMm",
    label: L("Storm sewer diameter", "Diamètre de l'égout pluvial"),
    type: "number",
    unit: "mm",
    default: 450,
    min: 300,
    max: 900,
    costImpact: 3,
    why: L(
      "Larger pipe costs more per metre.",
      "Un tuyau plus gros coûte plus par mètre.",
    ),
  },
  {
    id: "sanitarySewer",
    label: L("Replace sanitary sewer", "Remplacer l'égout sanitaire"),
    type: "boolean",
    default: true,
    costImpact: 4,
    why: L(
      "Sanitary sewers include maintenance holes and service laterals.",
      "Les égouts sanitaires comprennent regards et branchements.",
    ),
  },
  {
    id: "streetlighting",
    label: L("New streetlighting", "Nouvel éclairage de rue"),
    type: "boolean",
    default: true,
    costImpact: 2,
    why: L(
      "Poles are spaced about every 40 m.",
      "Les lampadaires sont espacés d'environ 40 m.",
    ),
  },
  {
    id: "excavationDepthM",
    label: L("Road excavation depth", "Profondeur d'excavation de la chaussée"),
    type: "number",
    unit: "m",
    default: 0.6,
    min: 0.3,
    max: 1.5,
    costImpact: 3,
    why: L(
      "Deeper excavation means more material out and in.",
      "Une excavation plus profonde signifie plus de matériaux à retirer et à remettre.",
    ),
  },
  {
    id: "soilCondition",
    label: L("Soil condition", "État du sol"),
    type: "enum",
    default: "unknown",
    options: [
      opt("good", "Good", "Bon"),
      opt("average", "Average", "Moyen"),
      opt("poor", "Poor (soft or wet)", "Mauvais (mou ou humide)"),
      opt("unknown", "Unknown", "Inconnu"),
    ],
    costImpact: 4,
    why: L(
      "Poor soils must be dug out and replaced, which a geotechnical report would confirm.",
      "Les mauvais sols doivent être excavés et remplacés, ce qu'un rapport géotechnique confirmerait.",
    ),
  },
  {
    id: "rockExpected",
    label: L("Rock expected", "Roc prévu"),
    type: "boolean",
    default: false,
    costImpact: 4,
    why: L(
      "Rock excavation costs several times more than soil.",
      "L'excavation de roc coûte plusieurs fois plus que celle du sol.",
    ),
  },
  {
    id: "trafficStaging",
    label: L("Traffic staging", "Gestion de la circulation"),
    type: "enum",
    default: "staged",
    options: [
      opt("full_closure", "Full closure", "Fermeture complète"),
      opt(
        "staged",
        "Staged (keep lanes open)",
        "Par étapes (voies maintenues)",
      ),
      opt("night_work", "Night work", "Travail de nuit"),
    ],
    costImpact: 3,
    why: L(
      "Keeping traffic moving slows work and adds traffic control.",
      "Maintenir la circulation ralentit les travaux et ajoute de la signalisation.",
    ),
  },
  {
    id: "utilityConflicts",
    label: L("Utility conflicts expected", "Conflits de services prévus"),
    type: "boolean",
    default: false,
    costImpact: 3,
    why: L(
      "Relocating gas, hydro, or telecom adds cost and delay.",
      "Déplacer le gaz, l'électricité ou les télécoms ajoute des coûts et des retards.",
    ),
  },
  {
    id: "servicesPer100m",
    label: L("Property services per 100 m", "Branchements par 100 m"),
    type: "number",
    default: 8,
    min: 0,
    max: 30,
    costImpact: 2,
    why: L(
      "Each property needs its own water and sewer connection.",
      "Chaque propriété a besoin de ses propres branchements d'eau et d'égout.",
    ),
  },
  {
    id: "boulevardWidthM",
    label: L(
      "Boulevard width (each side)",
      "Largeur du boulevard (de chaque côté)",
    ),
    type: "number",
    unit: "m",
    default: 2.5,
    min: 0,
    max: 8,
    costImpact: 1,
    why: L(
      "Boulevards are restored with topsoil and sod.",
      "Les boulevards sont restaurés avec terre végétale et gazon.",
    ),
  },
];

const noPipes = { watermain: false, stormSewer: false, sanitarySewer: false };

const subtypeDefaults: ComponentTemplate["subtypeDefaults"] = {
  road_reconstruction: {},
  road_resurfacing: {
    scope: "mill_and_pave",
    sidewalkSides: 0,
    streetlighting: false,
    ...noPipes,
  },
  sidewalk_cycling: {
    scope: "none",
    curbs: false,
    cycling: "cycle_track",
    streetlighting: false,
    ...noPipes,
  },
  watermain_replacement: {
    scope: "none",
    curbs: false,
    sidewalkSides: 0,
    streetlighting: false,
    stormSewer: false,
    sanitarySewer: false,
  },
  sewer_replacement: {
    scope: "none",
    curbs: false,
    sidewalkSides: 0,
    streetlighting: false,
    watermain: false,
  },
};

// Pavement structure by road class (thicknesses in m).
const STRUCTURE: Record<
  RoadClass,
  { granB: number; granA: number; hl8: number; hl3: number }
> = {
  local: { granB: 0.3, granA: 0.15, hl8: 0.05, hl3: 0.04 },
  collector: { granB: 0.45, granA: 0.15, hl8: 0.06, hl3: 0.04 },
  arterial: { granB: 0.6, granA: 0.15, hl8: 0.09, hl3: 0.05 },
};
const ASPHALT_T_PER_M3 = 2.4;
const PARKING_LANE_M = 2.4;
const PAINTED_BIKE_LANE_M = 1.5;
const CYCLE_TRACK_M = 2.0;
/** Width of pavement cut and restored over a pipe trench when the road isn't rebuilt. */
const TRENCH_RESTORATION_M = 2.5;
const MILL_DEPTH_M = 0.05;
/** Share of excavation assumed to be rock when rock is expected. */
const ROCK_SHARE = 0.15;
/** Share of excavation replaced when soils are poor. */
const POOR_SOIL_SHARE = 0.3;

/** Metres of road completed per month, by scope, before the staging factor. */
const METRES_PER_MONTH: Record<Scope, number> = {
  full_reconstruction: 150,
  mill_and_pave: 800,
  none: 200,
};
const STAGING_SLOWDOWN: Record<Staging, number> = {
  full_closure: 1,
  staged: 1.3,
  night_work: 1.5,
};
const TRAFFIC_PRICE: Record<Staging, string> = {
  full_closure: "traffic_control_full_closure",
  staged: "traffic_control_staged",
  night_work: "traffic_control_night",
};

const WATERMAIN_SIZES = [150, 200, 300, 400] as const;
const STORM_SIZES = [300, 450, 600, 900] as const;

/** Smallest standard size at least as large as `mm` (or the largest). */
function pickSize<T extends number>(sizes: readonly T[], mm: number): T {
  return sizes.find((s) => s >= mm) ?? sizes[sizes.length - 1]!;
}

function watermainPriceId(mm: number, material: string): string {
  const size = pickSize(WATERMAIN_SIZES, mm);
  if (size === 400) return "watermain_400_di";
  if (material === "ductile_iron" && size === 300) return "watermain_300_di";
  // No ductile iron items below 300 mm in the seed data; PVC price is the closest basis.
  return `watermain_${size}_pvc`;
}

function valvePriceId(mm: number): string {
  const size = pickSize(WATERMAIN_SIZES, mm);
  return size <= 150 ? "valve_150" : size === 200 ? "valve_200" : "valve_300";
}

const round = (x: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

/** Construction months for traffic control; at least one. */
export function roadMonths(
  lengthM: number,
  scope: Scope,
  staging: Staging,
): number {
  return Math.max(
    1,
    Math.ceil((lengthM / METRES_PER_MONTH[scope]) * STAGING_SLOWDOWN[staging]),
  );
}

/** Road platform width: lanes + parking + painted bike lanes. */
export function roadWidthM(p: TemplateContext["params"]): number {
  const bikeLanes =
    str<Cycling>(p, "cycling") === "painted_lane" ? 2 * PAINTED_BIKE_LANE_M : 0;
  return (
    num(p, "lanes") * num(p, "laneWidthM") +
    num(p, "parkingLanes") * PARKING_LANE_M +
    bikeLanes
  );
}

function deriveQuantities(ctx: TemplateContext): QuantityLine[] {
  const lengthM = ctx.measurements.lengthM ?? 0;
  if (lengthM <= 0) return [];
  const p = ctx.params;
  const lines: QuantityLine[] = [];
  const add = (
    localId: string,
    priceId: string,
    quantity: number,
    unit: QuantityLine["unit"],
    quantitySource: QuantityLine["quantitySource"],
  ) => {
    if (quantity > 0) {
      lines.push({
        localId,
        price: { kind: "unitPrice", id: priceId },
        quantity,
        unit,
        quantitySource,
      });
    }
  };

  const len = round(lengthM);
  const scope = str<Scope>(p, "scope");
  const roadClass = str<RoadClass>(p, "roadClass");
  const s = STRUCTURE[roadClass];
  const W = round(roadWidthM(p), 2);
  const area = round(len * W);
  const soil = str<Soil>(p, "soilCondition");

  // --- Road platform ---
  if (scope === "full_reconstruction") {
    const depth = num(p, "excavationDepthM");
    const volume = round(area * depth);
    const rock = bool(p, "rockExpected") ? round(volume * ROCK_SHARE) : 0;
    add(
      "pavement_removal",
      "pavement_removal",
      area,
      "m2",
      t(len, " m × ", W, " m"),
    );
    add(
      "excavation",
      "excavation_common",
      volume - rock,
      "m3",
      rock > 0
        ? t(
            area,
            " m² × ",
            depth,
            L(" m depth, less rock", " m de profondeur, moins le roc"),
          )
        : t(area, " m² × ", depth, L(" m depth", " m de profondeur")),
    );
    add(
      "rock",
      "excavation_rock",
      rock,
      "m3",
      t(
        volume,
        " m³ × ",
        ROCK_SHARE * 100,
        L("% assumed rock", " % de roc présumé"),
      ),
    );
    if (soil === "poor") {
      add(
        "unsuitable_soil",
        "unsuitable_soil_removal",
        round(volume * POOR_SOIL_SHARE),
        "m3",
        t(
          volume,
          " m³ × ",
          POOR_SOIL_SHARE * 100,
          L("% (poor soils)", " % (sols médiocres)"),
        ),
      );
      add("geotextile", "geotextile", area, "m2", t(len, " m × ", W, " m"));
    }
    add(
      "granular_b",
      "granular_b",
      round(area * s.granB),
      "m3",
      t(area, " m² × ", s.granB, L(` m (${roadClass})`, ` m (${roadClass})`)),
    );
    add(
      "granular_a",
      "granular_a",
      round(area * s.granA),
      "m3",
      t(area, " m² × ", s.granA, " m"),
    );
    add(
      "asphalt_hl8",
      "asphalt_hl8",
      round(area * s.hl8 * ASPHALT_T_PER_M3, 1),
      "t",
      t(area, " m² × ", s.hl8, " m × ", ASPHALT_T_PER_M3, " t/m³"),
    );
    add(
      "asphalt_hl3",
      "asphalt_hl3",
      round(area * s.hl3 * ASPHALT_T_PER_M3, 1),
      "t",
      t(area, " m² × ", s.hl3, " m × ", ASPHALT_T_PER_M3, " t/m³"),
    );
    add("tack_coat", "tack_coat", area, "m2", t(len, " m × ", W, " m"));
    add(
      "erosion_control",
      "erosion_sediment_control",
      len,
      "m",
      t(len, L(" m of road", " m de route")),
    );
  } else if (scope === "mill_and_pave") {
    add("milling", "asphalt_milling", area, "m2", t(len, " m × ", W, " m"));
    add("tack_coat", "tack_coat", area, "m2", t(len, " m × ", W, " m"));
    add(
      "asphalt_hl3",
      "asphalt_hl3",
      round(area * MILL_DEPTH_M * ASPHALT_T_PER_M3, 1),
      "t",
      t(area, " m² × ", MILL_DEPTH_M, " m × ", ASPHALT_T_PER_M3, " t/m³"),
    );
  }

  if (scope !== "none") {
    add(
      "markings",
      "pavement_markings",
      round(len * (num(p, "lanes") + 1)),
      "m",
      t(len, " m × ", num(p, "lanes") + 1, L(" lines", " lignes")),
    );
  }

  // --- Curbs, sidewalks, cycling ---
  if (bool(p, "curbs")) {
    // Mill and pave replaces only damaged curb (10%).
    const share =
      scope === "full_reconstruction" ? 1 : scope === "mill_and_pave" ? 0.1 : 1;
    add(
      "curb_gutter",
      "curb_gutter",
      round(len * 2 * share),
      "m",
      share === 1
        ? t(len, L(" m × 2 sides", " m × 2 côtés"))
        : t(
            len,
            L(" m × 2 sides × 10% repair", " m × 2 côtés × 10 % de réparation"),
          ),
    );
  }
  const sides = num(p, "sidewalkSides");
  if (sides > 0) {
    const w = num(p, "sidewalkWidthM");
    const sw = round(len * w * sides);
    const src = t(len, " m × ", w, " m × ", sides, L(" sides", " côtés"));
    if (scope === "full_reconstruction")
      add("sidewalk_removal", "sidewalk_removal", sw, "m2", src);
    add("sidewalk", "sidewalk_concrete", sw, "m2", src);
  }
  if (str<Cycling>(p, "cycling") === "cycle_track") {
    add(
      "cycle_track",
      "cycle_track_asphalt",
      round(len * CYCLE_TRACK_M * 2),
      "m2",
      t(len, " m × ", CYCLE_TRACK_M, L(" m × 2 sides", " m × 2 côtés")),
    );
  }

  // --- Watermain (SPEC 6.1: hydrants every 150 m, valves every 250 m) ---
  const services = Math.round((len / 100) * num(p, "servicesPer100m"));
  const servicesSrc = t(len, " m ÷ 100 × ", num(p, "servicesPer100m"));
  if (bool(p, "watermain")) {
    const mm = num(p, "watermainDiameterMm");
    add(
      "watermain",
      watermainPriceId(mm, str(p, "watermainMaterial")),
      len,
      "m",
      t(len, L(" m along the road", " m le long de la route")),
    );
    add(
      "hydrants",
      "hydrant",
      Math.ceil(len / 150),
      "each",
      t("⌈", len, " m ÷ 150 m⌉"),
    );
    add(
      "valves",
      valvePriceId(mm),
      Math.ceil(len / 250),
      "each",
      t("⌈", len, " m ÷ 250 m⌉"),
    );
    add("water_services", "water_service", services, "each", servicesSrc);
    add(
      "temporary_water",
      "temporary_water",
      len,
      "m",
      t(len, L(" m while the main is replaced", " m pendant le remplacement")),
    );
  }

  // --- Sewers (catch basins every 60 m both sides, maintenance holes every 100 m) ---
  if (bool(p, "stormSewer")) {
    const size = pickSize(STORM_SIZES, num(p, "stormDiameterMm"));
    add(
      "storm_sewer",
      `storm_${size}`,
      len,
      "m",
      t(len, L(" m along the road", " m le long de la route")),
    );
    add(
      "catch_basins",
      "catch_basin",
      Math.ceil(len / 60) * 2,
      "each",
      t("⌈", len, L(" m ÷ 60 m⌉ × 2 sides", " m ÷ 60 m⌉ × 2 côtés")),
    );
    add(
      "storm_mh",
      "maintenance_hole_1200",
      Math.ceil(len / 100),
      "each",
      t("⌈", len, " m ÷ 100 m⌉"),
    );
  }
  if (bool(p, "sanitarySewer")) {
    add(
      "sanitary_sewer",
      "sanitary_250",
      len,
      "m",
      t(len, L(" m along the road", " m le long de la route")),
    );
    add(
      "sanitary_mh",
      "maintenance_hole_1200",
      Math.ceil(len / 100),
      "each",
      t("⌈", len, " m ÷ 100 m⌉"),
    );
    add("sanitary_services", "sanitary_service", services, "each", servicesSrc);
  }
  const anyPipe =
    bool(p, "watermain") || bool(p, "stormSewer") || bool(p, "sanitarySewer");
  if (anyPipe)
    add(
      "cctv",
      "sewer_cctv",
      bool(p, "stormSewer") || bool(p, "sanitarySewer") ? len : 0,
      "m",
      t(len, " m"),
    );

  // Pipe work under a road that isn't rebuilt: cut and restore a trench-width strip.
  if (scope === "none" && anyPipe) {
    const strip = round(len * TRENCH_RESTORATION_M);
    const src = t(
      len,
      " m × ",
      TRENCH_RESTORATION_M,
      L(" m trench width", " m de largeur de tranchée"),
    );
    add("trench_pavement_removal", "pavement_removal", strip, "m2", src);
    add(
      "trench_granular_a",
      "granular_a",
      round(strip * s.granA),
      "m3",
      t(strip, " m² × ", s.granA, " m"),
    );
    add(
      "trench_asphalt",
      "asphalt_hl8",
      round(strip * (s.hl8 + s.hl3) * ASPHALT_T_PER_M3, 1),
      "t",
      t(strip, " m² × ", s.hl8 + s.hl3, " m × ", ASPHALT_T_PER_M3, " t/m³"),
    );
  }

  // --- Lighting, boulevards ---
  if (bool(p, "streetlighting")) {
    add(
      "streetlights",
      "streetlight_pole",
      Math.ceil(len / 40),
      "each",
      t("⌈", len, " m ÷ 40 m⌉"),
    );
    add("light_cable", "streetlight_cable", len, "m", t(len, " m"));
  }
  if (scope === "full_reconstruction") {
    const bw = num(p, "boulevardWidthM");
    add(
      "boulevard",
      "boulevard_restoration",
      round(len * bw * 2),
      "m2",
      t(len, " m × ", bw, L(" m × 2 sides", " m × 2 côtés")),
    );
  }

  // --- Traffic control, utilities ---
  const staging = str<Staging>(p, "trafficStaging");
  const months = roadMonths(len, scope, staging);
  add(
    "traffic_control",
    TRAFFIC_PRICE[staging],
    months,
    "month",
    t(
      "⌈",
      len,
      " m ÷ ",
      METRES_PER_MONTH[scope],
      L(" m/month", " m/mois"),
      " × ",
      STAGING_SLOWDOWN[staging],
      "⌉",
    ),
  );
  if (bool(p, "utilityConflicts")) {
    add(
      "utility_relocation",
      "utility_relocation",
      1,
      "lump",
      L("Utility conflicts expected", "Conflits de services prévus"),
    );
  }

  return lines;
}

function flags({
  component,
  params: p,
  measurements,
}: TemplateContext): TemplateFlag[] {
  const out: TemplateFlag[] = [];
  const ids = [component.id];
  const digging =
    str<Scope>(p, "scope") === "full_reconstruction" ||
    bool(p, "watermain") ||
    bool(p, "stormSewer") ||
    bool(p, "sanitarySewer");

  if (digging && str<Soil>(p, "soilCondition") === "unknown") {
    out.push({
      code: "soil_unknown",
      severity: "warning",
      title: L("Soil conditions unknown", "État du sol inconnu"),
      explanation: L(
        "Poor soils can add 20–40% to excavation and base costs. A geotechnical report would narrow the range.",
        "Des sols médiocres peuvent ajouter de 20 à 40 % aux coûts d'excavation et de fondation. Un rapport géotechnique réduirait l'incertitude.",
      ),
      componentIds: ids,
    });
  }
  if (digging && str<Soil>(p, "soilCondition") === "poor") {
    out.push({
      code: "poor_soils",
      severity: "warning",
      title: L("Poor soils", "Sols médiocres"),
      explanation: L(
        "Unsuitable soil is removed and replaced, and dewatering may be needed for deep pipe work.",
        "Le sol impropre est retiré et remplacé, et un assèchement peut être nécessaire pour les conduites profondes.",
      ),
      componentIds: ids,
    });
  }
  if (digging && bool(p, "rockExpected")) {
    out.push({
      code: "rock_expected",
      severity: "warning",
      title: L("Rock expected", "Roc prévu"),
      explanation: L(
        "Rock excavation is slow and costly; the estimate assumes 15% of the excavation is rock.",
        "L'excavation de roc est lente et coûteuse; l'estimation suppose que 15 % de l'excavation est du roc.",
      ),
      componentIds: ids,
    });
  }
  if (bool(p, "utilityConflicts")) {
    out.push({
      code: "utility_conflicts",
      severity: "warning",
      title: L("Utility conflicts", "Conflits de services"),
      explanation: L(
        "Relocating gas, hydro, or telecom is coordinated with each utility and can delay the schedule.",
        "Le déplacement du gaz, de l'électricité ou des télécoms se coordonne avec chaque fournisseur et peut retarder l'échéancier.",
      ),
      componentIds: ids,
    });
  }
  if (
    str<RoadClass>(p, "roadClass") === "arterial" &&
    str<Staging>(p, "trafficStaging") === "full_closure"
  ) {
    out.push({
      code: "arterial_full_closure",
      severity: "info",
      title: L(
        "Full closure of an arterial",
        "Fermeture complète d'une artère",
      ),
      explanation: L(
        "Arterials are rarely fully closed; staged work or night work is more likely and costs more.",
        "Les artères sont rarement fermées complètement; des travaux par étapes ou de nuit sont plus probables et plus coûteux.",
      ),
      componentIds: ids,
    });
  }
  if ((measurements.lengthM ?? 0) > 0 && (measurements.lengthM ?? 0) < 20) {
    out.push({
      code: "road_very_short",
      severity: "info",
      title: L("Very short road", "Route très courte"),
      explanation: L(
        "This road is under 20 m long. Check the drawing; fixed costs dominate very short segments.",
        "Cette route mesure moins de 20 m. Vérifiez le dessin; les coûts fixes dominent les très courts tronçons.",
      ),
      componentIds: ids,
    });
  }
  return out;
}

export const roadTemplate: ComponentTemplate = {
  type: "road",
  subtypes: [
    {
      id: "road_reconstruction",
      label: L("Road reconstruction", "Reconstruction de route"),
    },
    {
      id: "road_resurfacing",
      label: L("Road resurfacing", "Resurfaçage de route"),
    },
    {
      id: "sidewalk_cycling",
      label: L("Sidewalk and cycling", "Trottoir et aménagement cyclable"),
    },
    {
      id: "watermain_replacement",
      label: L("Watermain replacement", "Remplacement de conduite d'eau"),
    },
    {
      id: "sewer_replacement",
      label: L("Sewer replacement", "Remplacement d'égout"),
    },
  ],
  paramCatalog,
  subtypeDefaults,
  deriveQuantities,
  flags,
};
