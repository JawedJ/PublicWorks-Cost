import { z } from "zod";
import { IsoDateSchema, ParamValueSchema } from "./common";
import { ComponentSchema } from "./component";
import { ComponentGeometrySchema } from "./geometry";

/** Percent change per price category, e.g. 10 = +10%. */
export const ShocksSchema = z.object({
  asphalt: z.number().default(0),
  concrete: z.number().default(0),
  steel: z.number().default(0),
  pipe: z.number().default(0),
  lumber: z.number().default(0),
  labour: z.number().default(0),
});
export type Shocks = z.infer<typeof ShocksSchema>;

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().optional(),
  componentOverrides: z.record(
    z.string(),
    z.object({
      params: z.record(z.string(), ParamValueSchema).optional(),
      geometry: ComponentGeometrySchema.optional(),
      startOffsetMonths: z.int().min(0).optional(),
    }),
  ),
  /** Components that exist only in this scenario. */
  addedComponents: z.array(ComponentSchema),
  /** Baseline components excluded in this scenario. */
  removedComponentIds: z.array(z.string()),
  shocks: ShocksSchema,
  startDateOverride: IsoDateSchema.optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
