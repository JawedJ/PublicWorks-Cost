import { z } from "zod";

// Derived per component by A's measure.ts; never stored as truth.

const M = z.number().nonnegative();

export const SectionMeasurementsSchema = z.object({
  footprintM2: M,
  perimeterM: M,
  grossFloorAreaM2: M,
});
export type SectionMeasurements = z.infer<typeof SectionMeasurementsSchema>;

export const MeasurementsSchema = z.object({
  lengthM: M.optional(),
  areaM2: M.optional(),
  perimeterM: M.optional(),
  footprintM2: M.optional(),
  grossFloorAreaM2: M.optional(),
  /** Buildings: per-section values, keyed by section id (used for shape complexity). */
  sections: z.record(z.string(), SectionMeasurementsSchema).optional(),
  /** Placed features, keyed by feature id. */
  features: z.record(
    z.string(),
    z.object({ lengthM: M.optional(), areaM2: M.optional() }),
  ),
});
export type Measurements = z.infer<typeof MeasurementsSchema>;

export const ProjectMeasurementsSchema = z.object({
  /** Keyed by component id. */
  components: z.record(z.string(), MeasurementsSchema),
  totals: z.object({
    roadLengthM: M,
    parkAreaM2: M,
    buildingGfaM2: M,
    areaBoundaryM2: M.optional(),
  }),
});
export type ProjectMeasurements = z.infer<typeof ProjectMeasurementsSchema>;
