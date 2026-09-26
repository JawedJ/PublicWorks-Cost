import { z } from "zod";
import {
  ComponentTypeSchema,
  EstimateClassSchema,
  LocalizedTextSchema,
  ParamValueSchema,
  PriceCategorySchema,
  PriceRangeSchema,
  UnitSchema,
} from "./common";
import { LineItemCategorySchema } from "./estimate";

// Schemas for the seed data in src/data (SPEC 8). Every file carries `meta`.
// Public data (StatCan BCPI, CanadaBuys) gets its own schemas with P2.5 / P2.6.

export const DataMetaSchema = z.object({
  sample: z.boolean(),
  priceYear: z.int().min(2000).max(2100),
  notes: z.string(),
});

// --- Parameter catalogs (defined in engine templates; the AI may only use these ids) ---

export const ParamDefinitionSchema = z.object({
  id: z.string().min(1),
  label: LocalizedTextSchema,
  type: z.enum(["number", "enum", "boolean"]),
  unit: z.string().optional(),
  default: ParamValueSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  options: z
    .array(z.object({ value: z.string(), label: LocalizedTextSchema }))
    .optional(),
  costImpact: z.int().min(1).max(5),
  why: LocalizedTextSchema,
});
export type ParamDefinition = z.infer<typeof ParamDefinitionSchema>;

// --- unit-prices.json ---

export const UnitPriceItemSchema = z.object({
  id: z.string().min(1),
  description: LocalizedTextSchema,
  unit: UnitSchema,
  price: PriceRangeSchema,
  priceCategory: PriceCategorySchema,
  category: LineItemCategorySchema,
});
export type UnitPriceItem = z.infer<typeof UnitPriceItemSchema>;

export const UnitPricesFileSchema = z.object({
  meta: DataMetaSchema,
  items: z.array(UnitPriceItemSchema),
});
export type UnitPricesFile = z.infer<typeof UnitPricesFileSchema>;

// --- building-costs.json ---

export const BuildingCostsFileSchema = z.object({
  meta: DataMetaSchema,
  /** $/m² GFA by building subtype. */
  subtypes: z.record(
    z.string(),
    z.object({
      label: LocalizedTextSchema,
      perM2: PriceRangeSchema,
      /** Extra spread for program-driven types (school, hospital); 1 = none. */
      uncertaintyMultiplier: z.number().min(1).default(1),
    }),
  ),
  qualityFactors: z.object({
    basic: z.number().positive(),
    standard: z.number().positive(),
    high: z.number().positive(),
  }),
  /** Multipliers, e.g. 1.05 = +5%. */
  sustainabilityPremiums: z.object({
    code_minimum: z.number().positive(),
    high_performance: z.number().positive(),
    net_zero_ready: z.number().positive(),
  }),
  /** $/m² of roof area. */
  roofPremiums: z.object({
    pitched: PriceRangeSchema,
    green: PriceRangeSchema,
  }),
  specialSpaces: z.record(
    z.string(),
    z.object({
      label: LocalizedTextSchema,
      unit: z.enum(["each", "lump", "m2"]),
      price: PriceRangeSchema,
    }),
  ),
});
export type BuildingCostsFile = z.infer<typeof BuildingCostsFileSchema>;

// --- park-features.json ---

export const ParkFeaturesFileSchema = z.object({
  meta: DataMetaSchema,
  features: z.record(
    z.string(),
    z.object({
      label: LocalizedTextSchema,
      unit: z.enum(["each", "m", "m2"]),
      priceCategory: PriceCategorySchema,
      /** Keyed by tier (e.g. small / medium / large, or surface type); use 'default' when untiered. */
      tiers: z.record(z.string(), PriceRangeSchema),
    }),
  ),
});
export type ParkFeaturesFile = z.infer<typeof ParkFeaturesFileSchema>;

// --- structures.json ---

export const StructuresFileSchema = z.object({
  meta: DataMetaSchema,
  items: z.array(
    z.object({
      id: z.string().min(1),
      /** e.g. 'culvert_replacement', 'small_bridge', 'pumping_station'. */
      subtype: z.string().min(1),
      description: LocalizedTextSchema,
      unit: UnitSchema,
      price: PriceRangeSchema,
      priceCategory: PriceCategorySchema,
    }),
  ),
});
export type StructuresFile = z.infer<typeof StructuresFileSchema>;

// --- regional-factors.json ---

export const RegionalFactorsFileSchema = z.object({
  meta: DataMetaSchema,
  regions: z.array(
    z.object({
      key: z.string().min(1),
      name: LocalizedTextSchema,
      factor: z.number().positive(),
      /** Nearest CMA published in StatCan table 18-10-0289-01. */
      referenceCma: z.string().min(1),
      remote: z.boolean().default(false),
    }),
  ),
});
export type RegionalFactorsFile = z.infer<typeof RegionalFactorsFileSchema>;

// --- overrun-reference.json ---

export const OverrunReferenceFileSchema = z.object({
  meta: DataMetaSchema,
  entries: z.array(
    z.object({
      componentType: ComponentTypeSchema,
      /** Omit to apply to every subtype of the type. */
      subtype: z.string().optional(),
      estimateClass: EstimateClassSchema,
      probabilityOfOverrun: z.number().min(0).max(1),
      /** Lognormal parameters of the overrun factor (actual / estimate). */
      mu: z.number(),
      sigma: z.number().nonnegative(),
      note: LocalizedTextSchema,
    }),
  ),
});
export type OverrunReferenceFile = z.infer<typeof OverrunReferenceFileSchema>;

// --- Everything the engine needs, loaded and validated ---

export const RefDataSchema = z.object({
  unitPrices: UnitPricesFileSchema,
  buildingCosts: BuildingCostsFileSchema,
  parkFeatures: ParkFeaturesFileSchema,
  structures: StructuresFileSchema,
  regionalFactors: RegionalFactorsFileSchema,
  overrunReference: OverrunReferenceFileSchema,
});
export type RefData = z.infer<typeof RefDataSchema>;
