import type {
  Component,
  ComponentType,
  Flag,
  LineItemCategory,
  LocalizedText,
  Measurements,
  ParamDefinition,
  ParamValue,
  PriceCategory,
  PriceRange,
  ProjectSettings,
  RefData,
  SiteContext,
  Unit,
} from "@/lib/schemas";

// Shared engine types. The engine is pure: no React, no network, no Math.random.

/** Where a quantity line gets its unit price. */
export type PriceRef =
  /** An item in unit-prices.json; description, category, and price category come from it. */
  | { kind: "unitPrice"; id: string }
  /** A price the template looked up elsewhere (building costs, park features, structures, custom rates). */
  | {
      kind: "direct";
      description: LocalizedText;
      category: LineItemCategory;
      priceCategory: PriceCategory;
      price: PriceRange;
      source: LocalizedText;
      lowConfidence?: boolean;
    };

/** One derived quantity, before pricing. Pricing (P2.13) turns it into a `LineItem`. */
export type QuantityLine = {
  /** Unique within the component; overrides are keyed by it. The line item id is `${componentId}:${localId}`. */
  localId: string;
  price: PriceRef;
  quantity: number;
  unit: Unit;
  /** How the quantity was derived, e.g. "812 m × 11.4 m × 0.6 m depth". */
  quantitySource: LocalizedText;
  /** Replaces the price item's description, e.g. to name the park feature. */
  description?: LocalizedText;
  elementRef?: { sectionId?: string; featureId?: string };
};

/** A flag before the engine adds its id. */
export type TemplateFlag = Omit<Flag, "id">;

/** Params with every catalog default filled in. */
export type ResolvedParams = Record<string, ParamValue>;

export type TemplateContext = {
  component: Component;
  measurements: Measurements;
  params: ResolvedParams;
  refData: RefData;
  settings: ProjectSettings;
  siteContext?: SiteContext;
};

export type ComponentTemplate = {
  type: ComponentType;
  subtypes: { id: string; label: LocalizedText }[];
  paramCatalog: ParamDefinition[];
  /** Catalog defaults that differ by subtype (e.g. resurfacing has no watermain). */
  subtypeDefaults?: Record<string, Record<string, ParamValue>>;
  deriveQuantities: (ctx: TemplateContext) => QuantityLine[];
  flags: (ctx: TemplateContext) => TemplateFlag[];
};
