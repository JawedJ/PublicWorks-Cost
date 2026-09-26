import { z } from "zod";
import {
  ComponentTypeSchema,
  ParamSourceSchema,
  ParamValueSchema,
} from "./common";
import { ComponentGeometrySchema, CustomPricingSchema } from "./geometry";

export const ParamMetaSchema = z.object({
  source: ParamSourceSchema,
  /** Supporting phrase or quote, e.g. "3-storey" from the prompt or a line from a geotech report. */
  evidence: z.string().optional(),
});
export type ParamMeta = z.infer<typeof ParamMetaSchema>;

export const OverridesSchema = z.object({
  quantities: z.record(z.string(), z.number().nonnegative()),
  unitPrices: z.record(z.string(), z.number().nonnegative()),
});
export type Overrides = z.infer<typeof OverridesSchema>;

export const ComponentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: ComponentTypeSchema,
    /** e.g. 'road_reconstruction', 'library', 'culvert_replacement'; 'custom' for custom components. */
    subtype: z.string().min(1),
    /** 'planned' = from the prompt's build list, not drawn yet (contributes no cost). */
    status: z.enum(["planned", "drawn"]),
    /** 'generated' = placed by the procedural layout; becomes 'user' once edited. */
    origin: z.enum(["user", "generated"]),
    geometry: ComponentGeometrySchema.optional(),
    params: z.record(z.string(), ParamValueSchema),
    paramMeta: z.record(z.string(), ParamMetaSchema),
    overrides: OverridesSchema,
    /** Custom components only (SPEC 6.5). */
    customPricing: CustomPricingSchema.optional(),
    /** Optional phasing relative to project start. */
    startOffsetMonths: z.int().min(0).optional(),
    visible: z.boolean(),
  })
  .superRefine((c, ctx) => {
    if (c.status === "drawn" && !c.geometry) {
      ctx.addIssue({
        code: "custom",
        path: ["geometry"],
        message: "A drawn component needs geometry",
      });
    }
    if (c.type === "building" && c.geometry && !c.geometry.sections?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["geometry", "sections"],
        message: "A drawn building needs at least one section",
      });
    }
  });
export type Component = z.infer<typeof ComponentSchema>;
