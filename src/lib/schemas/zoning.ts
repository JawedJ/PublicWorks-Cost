import { z } from "zod";
import { IsoDateTimeSchema } from "./common";

// SPEC 8.3 (MVP): the zone each building sits in, from a city's public zoning
// service. Stored on the project so the engine stays network-free. Advisory only:
// it produces flags and never changes the estimate.

export const ZoneResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    city: z.string(),
    bylaw: z.string(),
    /** Full zone code as mapped, e.g. "MD S35" or "(F)C1RM1". */
    code: z.string(),
    /** Plain-language zone name or family, e.g. "Mixed Use - Commercial Zones II". */
    name: z.string().optional(),
    /** Site-specific provision, if the map names one. */
    siteSpecific: z.string().optional(),
    /** Link to the by-law text for this zone, when the city provides it. */
    link: z.url().optional(),
  }),
  /** No public zoning service covers this spot. */
  z.object({ status: z.literal("no_data") }),
  /** The service didn't answer (timeout, error). */
  z.object({ status: z.literal("error") }),
]);
export type ZoneResult = z.infer<typeof ZoneResultSchema>;

export const ZoningContextSchema = z.object({
  fetchedAt: IsoDateTimeSchema,
  /** Keyed by building component id. */
  zones: z.record(z.string(), ZoneResultSchema),
});
export type ZoningContext = z.infer<typeof ZoningContextSchema>;

export const ZoningRequestSchema = z.object({
  points: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        lng: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
      }),
    )
    .min(1)
    .max(30),
});
export type ZoningRequest = z.infer<typeof ZoningRequestSchema>;

export const ZoningResponseSchema = z.object({
  zones: z.record(z.string(), ZoneResultSchema),
});
export type ZoningResponse = z.infer<typeof ZoningResponseSchema>;
