import type {
  LocalizedText,
  ParamDefinition,
  PlacedFeature,
  PriceRange,
} from "@/lib/schemas";
import { bool, num, resolveDefinitions, str } from "../params";
import { L, t } from "../text";
import { customLine } from "./custom";
import type {
  ComponentTemplate,
  QuantityLine,
  TemplateContext,
  TemplateFlag,
} from "../types";

// Parks & public spaces (SPEC 6.2). The boundary gives area A and perimeter;
// placed features are priced from park-features.json by tier.
// Custom features ('custom' kind) are priced by the custom-element logic (P2.12).

const opt = (value: string, en: string, fr: string) => ({
  value,
  label: L(en, fr),
});

const paramCatalog: ParamDefinition[] = [
  {
    id: "hardscapeShare",
    label: L("Hard surface share", "Part de surfaces dures"),
    type: "number",
    default: 0,
    min: 0,
    max: 1,
    costImpact: 3,
    why: L(
      "Paved plaza areas cost far more per m² than lawn.",
      "Les surfaces pavées coûtent beaucoup plus par m² que le gazon.",
    ),
  },
  {
    id: "hardscapeSurface",
    label: L("Hard surface type", "Type de surface dure"),
    type: "enum",
    default: "unit_pavers",
    options: [
      opt("concrete", "Concrete", "Béton"),
      opt("unit_pavers", "Unit pavers", "Pavés"),
      opt("stone", "Natural stone", "Pierre naturelle"),
    ],
    costImpact: 2,
    why: L(
      "Stone costs more than concrete.",
      "La pierre coûte plus que le béton.",
    ),
  },
  {
    id: "seedInsteadOfSod",
    label: L(
      "Seed instead of sod",
      "Ensemencement plutôt que gazon en plaques",
    ),
    type: "boolean",
    default: false,
    costImpact: 2,
    why: L(
      "Seeding is cheaper but slower to establish.",
      "L'ensemencement coûte moins cher, mais s'établit plus lentement.",
    ),
  },
  {
    id: "irrigation",
    label: L("Irrigation", "Irrigation"),
    type: "boolean",
    default: false,
    costImpact: 2,
    why: L(
      "Irrigation is priced over the lawn area.",
      "L'irrigation est calculée sur la surface de gazon.",
    ),
  },
  {
    id: "fenceFraction",
    label: L("Share of perimeter fenced", "Part du périmètre clôturée"),
    type: "number",
    default: 0,
    min: 0,
    max: 1,
    costImpact: 2,
    why: L(
      "Fencing is priced per metre of perimeter.",
      "La clôture est calculée par mètre de périmètre.",
    ),
  },
  {
    id: "treeCount",
    label: L(
      "Trees planted (outside planting areas)",
      "Arbres plantés (hors zones de plantation)",
    ),
    type: "number",
    default: 0,
    min: 0,
    max: 5000,
    costImpact: 2,
    why: L(
      "Each tree is supplied, planted, and guaranteed.",
      "Chaque arbre est fourni, planté et garanti.",
    ),
  },
  {
    id: "siteFurniture",
    label: L("Site furniture (benches, bins)", "Mobilier (bancs, poubelles)"),
    type: "boolean",
    default: true,
    costImpact: 1,
    why: L("An allowance per hectare.", "Une provision par hectare."),
  },
];

/** Parameters per feature kind; TIER_PARAM says which one picks the price tier. */
export const featureParamCatalog: Record<string, ParamDefinition[]> = {
  playground: [
    {
      id: "sizeTier",
      label: L("Size", "Taille"),
      type: "enum",
      default: "medium",
      options: [
        opt("small", "Small", "Petite"),
        opt("medium", "Medium", "Moyenne"),
        opt("large", "Large", "Grande"),
      ],
      costImpact: 4,
      why: L(
        "Size drives equipment cost.",
        "La taille détermine le coût de l'équipement.",
      ),
    },
    {
      id: "accessibility",
      label: L("Accessibility", "Accessibilité"),
      type: "enum",
      default: "standard",
      options: [
        opt("standard", "Standard", "Standard"),
        opt(
          "enhanced",
          "Enhanced (rubber surfacing, ramps)",
          "Améliorée (surface caoutchoutée, rampes)",
        ),
      ],
      costImpact: 3,
      why: L(
        "Enhanced accessibility adds about 15%.",
        "Une accessibilité améliorée ajoute environ 15 %.",
      ),
    },
  ],
  splash_pad: [
    {
      id: "sizeTier",
      label: L("Size", "Taille"),
      type: "enum",
      default: "small",
      options: [
        opt("small", "Small", "Petit"),
        opt("medium", "Medium", "Moyen"),
        opt("large", "Large", "Grand"),
      ],
      costImpact: 4,
      why: L(
        "Size drives equipment and water systems.",
        "La taille détermine l'équipement et les systèmes d'eau.",
      ),
    },
  ],
  sports_field: [
    {
      id: "surface",
      label: L("Surface", "Surface"),
      type: "enum",
      default: "natural",
      options: [
        opt("natural", "Natural grass", "Gazon naturel"),
        opt("artificial_turf", "Artificial turf", "Gazon synthétique"),
      ],
      costImpact: 5,
      why: L(
        "Artificial turf costs about four times natural grass.",
        "Le gazon synthétique coûte environ quatre fois le gazon naturel.",
      ),
    },
    {
      id: "lighting",
      label: L("Field lighting", "Éclairage du terrain"),
      type: "boolean",
      default: false,
      costImpact: 3,
      why: L(
        "Lighting is priced over the field area.",
        "L'éclairage est calculé sur la surface du terrain.",
      ),
    },
  ],
  trail: [
    {
      id: "widthM",
      label: L("Width", "Largeur"),
      type: "number",
      unit: "m",
      default: 2.5,
      min: 1,
      max: 6,
      costImpact: 3,
      why: L(
        "Trail area is length × width.",
        "La surface du sentier est longueur × largeur.",
      ),
    },
    {
      id: "surface",
      label: L("Surface", "Surface"),
      type: "enum",
      default: "granular",
      options: [
        opt("granular", "Granular", "Granulat"),
        opt("asphalt", "Asphalt", "Enrobé"),
        opt("boardwalk", "Boardwalk", "Promenade en bois"),
      ],
      costImpact: 4,
      why: L(
        "Asphalt and boardwalk cost more than granular.",
        "L'enrobé et le bois coûtent plus que le granulat.",
      ),
    },
    {
      id: "lighting",
      label: L("Trail lighting", "Éclairage du sentier"),
      type: "boolean",
      default: false,
      costImpact: 3,
      why: L(
        "A light pole about every 30 m.",
        "Un lampadaire environ aux 30 m.",
      ),
    },
  ],
  parking: [
    {
      id: "surface",
      label: L("Surface", "Surface"),
      type: "enum",
      default: "asphalt",
      options: [
        opt("granular", "Granular", "Granulat"),
        opt("asphalt", "Asphalt", "Enrobé"),
        opt("permeable", "Permeable pavers", "Pavés perméables"),
      ],
      costImpact: 3,
      why: L(
        "Surface drives cost per m².",
        "La surface détermine le coût par m².",
      ),
    },
  ],
  washroom: [
    {
      id: "floorAreaM2",
      label: L("Floor area", "Surface de plancher"),
      type: "number",
      unit: "m²",
      default: 60,
      min: 10,
      max: 400,
      costImpact: 4,
      why: L("Priced per m² of building.", "Calculé par m² de bâtiment."),
    },
  ],
  shade_structure: [
    {
      id: "sizeTier",
      label: L("Size", "Taille"),
      type: "enum",
      default: "small",
      options: [
        opt("small", "Small", "Petite"),
        opt("large", "Large", "Grande"),
      ],
      costImpact: 2,
      why: L(
        "Larger structures cost more.",
        "Les structures plus grandes coûtent plus.",
      ),
    },
  ],
  seating_area: [],
  tree_planting: [
    {
      id: "density",
      label: L("Planting density", "Densité de plantation"),
      type: "enum",
      default: "medium",
      options: [
        opt("low", "Low", "Faible"),
        opt("medium", "Medium", "Moyenne"),
        opt("high", "High", "Élevée"),
      ],
      costImpact: 2,
      why: L(
        "Denser planting costs more per m².",
        "Une plantation plus dense coûte plus par m².",
      ),
    },
  ],
  plaza: [
    {
      id: "surface",
      label: L("Surface", "Surface"),
      type: "enum",
      default: "unit_pavers",
      options: [
        opt("concrete", "Concrete", "Béton"),
        opt("unit_pavers", "Unit pavers", "Pavés"),
        opt("stone", "Natural stone", "Pierre naturelle"),
      ],
      costImpact: 3,
      why: L(
        "Stone costs more than concrete.",
        "La pierre coûte plus que le béton.",
      ),
    },
  ],
};

/** Which resolved param picks the price tier for each kind (otherwise the 'default' tier). */
const TIER_PARAM: Record<string, string> = {
  playground: "sizeTier",
  splash_pad: "sizeTier",
  shade_structure: "sizeTier",
  sports_field: "surface",
  trail: "surface",
  parking: "surface",
  tree_planting: "density",
  plaza: "surface",
};
const ENHANCED_ACCESSIBILITY = 1.15;
const TRAIL_LIGHT_SPACING_M = 30;
const SAMPLE_SOURCE = L(
  "Sample Ontario park feature price, 2025",
  "Prix type ontarien d'aménagement de parc (échantillon), 2025",
);

const scale = (r: PriceRange, f: number): PriceRange => ({
  low: r.low * f,
  typical: r.typical * f,
  high: r.high * f,
});
const round = (x: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};
/** The display label of an enum option, if the definition exists. */
function optionLabel(
  defs: ParamDefinition[] | undefined,
  paramId: string | undefined,
  value: string,
): LocalizedText | undefined {
  return defs
    ?.find((d) => d.id === paramId)
    ?.options?.find((o) => o.value === value)?.label;
}

const isPolygon = (f: PlacedFeature) => f.geometry.geometry.type === "Polygon";

function deriveQuantities(ctx: TemplateContext): QuantityLine[] {
  const A = round(ctx.measurements.areaM2 ?? 0);
  if (A <= 0) return [];
  const p = ctx.params;
  const catalog = ctx.refData.parkFeatures.features;
  const features = ctx.component.geometry?.features ?? [];
  const lines: QuantityLine[] = [];
  const unit = (
    localId: string,
    id: string,
    quantity: number,
    u: QuantityLine["unit"],
    src: LocalizedText,
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

  /** Adds a line priced from park-features.json. */
  const feature = (
    f: PlacedFeature,
    localId: string,
    kind: string,
    tier: string,
    quantity: number,
    src: LocalizedText,
    factor = 1,
    note?: LocalizedText,
  ) => {
    const item = catalog[kind];
    const range = item?.tiers[tier] ?? item?.tiers.default;
    if (!item || !range || quantity <= 0) return;
    const label = optionLabel(
      featureParamCatalog[kind],
      TIER_PARAM[kind],
      tier,
    );
    const name = label ? t(item.label, " (", label, ")") : item.label;
    lines.push({
      localId,
      price: {
        kind: "direct",
        description: note ? t(name, ", ", note) : name,
        category: "park_features",
        priceCategory: item.priceCategory,
        price: scale(range, factor),
        source: item.source ?? SAMPLE_SOURCE,
      },
      quantity,
      unit: item.unit,
      quantitySource: src,
      elementRef: { featureId: f.id },
    });
  };

  // --- Placed features; track the area they cover so lawn isn't double counted ---
  let coveredM2 = 0;
  for (const f of features) {
    if (f.kind === "custom") {
      const m = ctx.measurements.features[f.id] ?? {};
      const line = customLine(
        `feature:${f.id}`,
        f.customLabel ?? "Custom",
        f.customPricing,
        m,
        ctx.refData,
        { featureId: f.id },
      );
      if (line) {
        lines.push(line);
        if (isPolygon(f)) coveredM2 += m.areaM2 ?? 0;
      }
      continue;
    }
    const fp = resolveDefinitions(featureParamCatalog[f.kind] ?? [], f.params);
    const m = ctx.measurements.features[f.id] ?? {};
    const areaM2 = round(m.areaM2 ?? 0);
    const lengthM = round(m.lengthM ?? 0);
    const tierId = TIER_PARAM[f.kind];
    const tier = tierId ? str(fp, tierId) : "default";
    const id = (suffix = "") => `feature:${f.id}${suffix}`;

    switch (f.kind) {
      case "playground": {
        const enhanced = str(fp, "accessibility") === "enhanced";
        feature(
          f,
          id(),
          "playground",
          tier,
          1,
          L("1 playground", "1 aire de jeux"),
          enhanced ? ENHANCED_ACCESSIBILITY : 1,
          enhanced
            ? L(
                "enhanced accessibility (+15%)",
                "accessibilité améliorée (+15 %)",
              )
            : undefined,
        );
        break;
      }
      case "splash_pad":
      case "shade_structure":
      case "seating_area":
        feature(f, id(), f.kind, tier, 1, L("1 unit", "1 unité"));
        break;
      case "washroom": {
        const gfa = num(fp, "floorAreaM2");
        feature(
          f,
          id(),
          "washroom",
          tier,
          gfa,
          t(gfa, L(" m² floor area", " m² de plancher")),
        );
        break;
      }
      case "trail": {
        const w = num(fp, "widthM");
        const trailArea = round(lengthM * w);
        coveredM2 += trailArea;
        feature(
          f,
          id(),
          "trail",
          tier,
          trailArea,
          t(lengthM, " m × ", w, " m"),
        );
        if (bool(fp, "lighting")) {
          const poles = Math.ceil(lengthM / TRAIL_LIGHT_SPACING_M);
          feature(
            f,
            id(":lighting"),
            "trail_lighting",
            "default",
            poles,
            t("⌈", lengthM, " m ÷ ", TRAIL_LIGHT_SPACING_M, " m⌉"),
          );
        }
        break;
      }
      case "sports_field": {
        coveredM2 += areaM2;
        feature(
          f,
          id(),
          "sports_field",
          tier,
          areaM2,
          t(areaM2, L(" m² drawn", " m² dessinés")),
        );
        if (bool(fp, "lighting")) {
          feature(
            f,
            id(":lighting"),
            "sports_field_lighting",
            "default",
            areaM2,
            t(areaM2, L(" m² of field", " m² de terrain")),
          );
        }
        break;
      }
      default: {
        // Area-priced kinds (parking, plaza, tree planting, and matched kinds like skate_park).
        const item = catalog[f.kind];
        if (!item) break;
        if (item.unit === "m2") {
          if (isPolygon(f)) coveredM2 += areaM2;
          feature(
            f,
            id(),
            f.kind,
            tier,
            areaM2,
            t(areaM2, L(" m² drawn", " m² dessinés")),
          );
        } else {
          feature(f, id(), f.kind, tier, 1, L("1 unit", "1 unité"));
        }
      }
    }
  }

  // --- Park-wide works ---
  const perimeter = round(ctx.measurements.perimeterM ?? 0);
  const hardscape = round(
    Math.max(0, A - coveredM2) * num(p, "hardscapeShare"),
  );
  const lawn = Math.max(0, A - coveredM2 - hardscape);
  const lawnSrc =
    coveredM2 + hardscape > 0
      ? t(
          A,
          " m² − ",
          round(coveredM2 + hardscape),
          L(
            " m² features and hard surfaces",
            " m² d'aménagements et de surfaces dures",
          ),
        )
      : t(A, L(" m² park area", " m² de parc"));

  unit(
    "grading",
    "grading_rough_fine",
    A,
    "m2",
    t(A, L(" m² park area", " m² de parc")),
  );
  if (hardscape > 0) {
    const surface = str(p, "hardscapeSurface");
    lines.push({
      localId: "hardscape",
      price: {
        kind: "direct",
        description: t(
          catalog.plaza!.label,
          " (",
          optionLabel(paramCatalog, "hardscapeSurface", surface) ?? surface,
          ")",
        ),
        category: "park_features",
        priceCategory: catalog.plaza!.priceCategory,
        price:
          catalog.plaza!.tiers[surface] ?? catalog.plaza!.tiers.unit_pavers!,
        source: SAMPLE_SOURCE,
      },
      quantity: hardscape,
      unit: "m2",
      quantitySource: t(
        round(A - coveredM2),
        " m² × ",
        num(p, "hardscapeShare") * 100,
        "%",
      ),
    });
  }
  unit("topsoil", "topsoil_150", round(lawn), "m2", lawnSrc);
  unit(
    bool(p, "seedInsteadOfSod") ? "seed" : "sod",
    bool(p, "seedInsteadOfSod") ? "hydroseed" : "sod",
    round(lawn),
    "m2",
    lawnSrc,
  );
  if (bool(p, "irrigation"))
    unit("irrigation", "irrigation", round(lawn), "m2", lawnSrc);
  const fence = round(perimeter * num(p, "fenceFraction"));
  unit(
    "fencing",
    "chain_link_fence",
    fence,
    "m",
    t(
      perimeter,
      L(" m perimeter × ", " m de périmètre × "),
      num(p, "fenceFraction") * 100,
      "%",
    ),
  );
  unit(
    "trees",
    "tree_60mm",
    num(p, "treeCount"),
    "each",
    t(num(p, "treeCount"), L(" trees", " arbres")),
  );
  if (bool(p, "siteFurniture")) {
    const ha = round(A / 10_000, 2);
    unit(
      "furniture",
      "site_furniture_allowance",
      ha,
      "ha",
      t(A, " m² = ", ha, " ha"),
    );
  }
  unit(
    "erosion_control",
    "erosion_sediment_control",
    perimeter,
    "m",
    t(perimeter, L(" m perimeter", " m de périmètre")),
  );

  return lines;
}

function flags({
  component,
  measurements,
  refData,
}: TemplateContext): TemplateFlag[] {
  const out: TemplateFlag[] = [];
  const unpricedKinds = (component.geometry?.features ?? [])
    .filter(
      (f) => f.kind !== "custom" && !(f.kind in refData.parkFeatures.features),
    )
    .map((f) => f.kind);
  const A = measurements.areaM2 ?? 0;
  if (A > 0 && A < 500) {
    out.push({
      code: "park_very_small",
      severity: "info",
      title: L("Very small park", "Très petit parc"),
      explanation: L(
        "This park is under 500 m². Check the drawing; fixed costs dominate very small sites.",
        "Ce parc fait moins de 500 m². Vérifiez le dessin; les coûts fixes dominent les très petits sites.",
      ),
      componentIds: [component.id],
    });
  }
  const covered = Object.values(measurements.features).reduce(
    (s, m) => s + (m.areaM2 ?? 0),
    0,
  );
  if (A > 0 && covered > A) {
    out.push({
      code: "park_features_exceed_area",
      severity: "warning",
      title: L(
        "Features larger than the park",
        "Aménagements plus grands que le parc",
      ),
      explanation: L(
        "The drawn features cover more area than the park itself. Some features may overlap or extend outside the boundary.",
        "Les aménagements dessinés couvrent plus que le parc lui-même. Certains se chevauchent peut-être ou dépassent la limite.",
      ),
      componentIds: [component.id],
    });
  }
  if (unpricedKinds.length > 0) {
    out.push({
      code: "park_feature_not_priced",
      severity: "warning",
      title: L(
        "Some features have no price",
        "Certains aménagements n'ont pas de prix",
      ),
      explanation: t(
        L("No cost data for: ", "Aucune donnée de coût pour : "),
        [...new Set(unpricedKinds)].join(", "),
        L(
          ". Add them as custom features to price them.",
          ". Ajoutez-les comme aménagements personnalisés pour les chiffrer.",
        ),
      ),
      componentIds: [component.id],
    });
  }
  return out;
}

export const parkTemplate: ComponentTemplate = {
  type: "park",
  subtypes: [
    {
      id: "neighbourhood_park",
      label: L("Neighbourhood park", "Parc de quartier"),
    },
    { id: "community_park", label: L("Community park", "Parc communautaire") },
    { id: "plaza", label: L("Plaza", "Place publique") },
  ],
  paramCatalog,
  subtypeDefaults: {
    community_park: { siteFurniture: true, fenceFraction: 0.2 },
    plaza: { hardscapeShare: 0.8, irrigation: true },
  },
  deriveQuantities,
  flags,
};
