import { z } from "zod";
import { NonNegativeSchema, ParamValueSchema } from "./common";
import { AnyFeatureSchema, PolygonFeatureSchema } from "./geojson";

/**
 * How a custom element (SPEC 6.5) is priced. `matched` uses a seed-data item with a wider band;
 * `own_rate` is a user-entered rate (band defaults to -30% / +60% when low/high are omitted).
 */
export const CustomPricingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("matched"),
    /** Seed-data id, e.g. a unit-prices.json item or a park-features.json kind. */
    basisId: z.string().min(1),
    unit: z.enum(["m", "m2", "each"]),
    /** Set when the AI proposed the match; cleared once the user confirms. */
    suggestedByAi: z.boolean().default(false),
  }),
  z.object({
    mode: z.literal("own_rate"),
    unit: z.enum(["m", "m2", "each", "lump"]),
    rate: NonNegativeSchema,
    low: NonNegativeSchema.optional(),
    high: NonNegativeSchema.optional(),
  }),
]);
export type CustomPricing = z.infer<typeof CustomPricingSchema>;

export const RoofTypeSchema = z.enum(["flat", "pitched", "green"]);
export type RoofType = z.infer<typeof RoofTypeSchema>;

export const BuildingSectionSchema = z.object({
  id: z.string().min(1),
  /** Any polygon: L-shapes, curves (approximated), courtyards (holes allowed). */
  footprint: PolygonFeatureSchema,
  storeys: z.int().min(1).max(80),
  floorHeightM: z.number().positive().max(20).optional(),
  roof: RoofTypeSchema,
  use: z.string().optional(),
});
export type BuildingSection = z.infer<typeof BuildingSectionSchema>;

export const PlacedFeatureSchema = z
  .object({
    id: z.string().min(1),
    /** A known kind from park-features.json, or 'custom'. */
    kind: z.string().min(1),
    customLabel: z.string().optional(),
    customPricing: CustomPricingSchema.optional(),
    geometry: AnyFeatureSchema,
    params: z.record(z.string(), ParamValueSchema),
  })
  .superRefine((f, ctx) => {
    if (f.kind === "custom" && !f.customLabel) {
      ctx.addIssue({
        code: "custom",
        path: ["customLabel"],
        message: "Custom features need a name",
      });
    }
  });
export type PlacedFeature = z.infer<typeof PlacedFeatureSchema>;

export const ComponentGeometrySchema = z.object({
  /** Road path, park/site boundary, structure pin, or custom element shape. */
  primary: AnyFeatureSchema,
  /** Buildings only: one or more footprint sections, each with its own height. */
  sections: z.array(BuildingSectionSchema).optional(),
  features: z.array(PlacedFeatureSchema),
});
export type ComponentGeometry = z.infer<typeof ComponentGeometrySchema>;
