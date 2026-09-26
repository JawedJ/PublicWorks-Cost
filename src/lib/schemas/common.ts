import { z } from "zod";

export const LocaleSchema = z.enum(["en", "fr"]);
export type Locale = z.infer<typeof LocaleSchema>;

/** Text the engine or data files produce for display; UI chrome still goes through next-intl. */
export const LocalizedTextSchema = z.object({ en: z.string(), fr: z.string() });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const ParamValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export type ParamValue = z.infer<typeof ParamValueSchema>;

export const ParamSourceSchema = z.enum([
  "default",
  "user",
  "ai_prompt",
  "ai_document",
  "site_context",
]);
export type ParamSource = z.infer<typeof ParamSourceSchema>;

export const ComponentTypeSchema = z.enum([
  "road",
  "park",
  "building",
  "structure",
  "custom",
]);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

/** Price categories share correlated shocks in the Monte Carlo and in scenarios. */
export const PriceCategorySchema = z.enum([
  "asphalt",
  "concrete",
  "steel",
  "pipe",
  "lumber",
  "labour",
  "general",
]);
export type PriceCategory = z.infer<typeof PriceCategorySchema>;

export const EstimateClassSchema = z.enum(["D", "C", "B", "A"]);
export type EstimateClass = z.infer<typeof EstimateClassSchema>;

/** Key into regional-factors.json. */
export const RegionKeySchema = z.string().min(1);
export type RegionKey = z.infer<typeof RegionKeySchema>;

export const UnitSchema = z.enum([
  "m",
  "m2",
  "m3",
  "ha",
  "t",
  "each",
  "lump",
  "month",
]);
export type Unit = z.infer<typeof UnitSchema>;

export const IsoDateSchema = z.iso.date();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const NonNegativeSchema = z.number().nonnegative();

/** Low / typical / high cost band, in CAD. */
export const PriceRangeSchema = z
  .object({
    low: NonNegativeSchema,
    typical: NonNegativeSchema,
    high: NonNegativeSchema,
  })
  .refine((r) => r.low <= r.typical && r.typical <= r.high, {
    message: "Expected low <= typical <= high",
  });
export type PriceRange = z.infer<typeof PriceRangeSchema>;
