import { z } from "zod";
import { IsoDateTimeSchema } from "./common";
import { AnyFeatureSchema } from "./geojson";

// Result of /api/geo/context (SPEC section 6 / P6.1), looked up once for the project area.

export const SiteFeatureKindSchema = z.enum([
  "school",
  "hospital",
  "waterway",
  "rail",
  "road",
  "floodplain",
  "building",
]);
export type SiteFeatureKind = z.infer<typeof SiteFeatureKindSchema>;

export const SiteFeatureSchema = z.object({
  id: z.string().min(1),
  kind: SiteFeatureKindSchema,
  name: z.string().optional(),
  geometry: AnyFeatureSchema,
  /** OSM tags kept for road attributes (lanes, surface, maxspeed, ...) and buildings (levels, height). */
  tags: z.record(z.string(), z.string()).optional(),
});
export type SiteFeature = z.infer<typeof SiteFeatureSchema>;

export const SiteContextSchema = z.object({
  source: z.enum(["overpass", "demo_snapshot", "unavailable"]),
  fetchedAt: IsoDateTimeSchema,
  features: z.array(SiteFeatureSchema),
});
export type SiteContext = z.infer<typeof SiteContextSchema>;
