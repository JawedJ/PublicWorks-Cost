import { z } from "zod";

// Minimal GeoJSON (WGS84) schemas. Inferred types are assignable to @types/geojson,
// so Turf, MapLibre and Terra Draw accept them directly.

/** [lng, lat] with optional extra coordinates (e.g. altitude). */
export const PositionSchema = z.tuple(
  [z.number().min(-180).max(180), z.number().min(-90).max(90)],
  z.number(),
);

const LinearRingSchema = z
  .array(PositionSchema)
  .min(4)
  .refine(
    (ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return (
        first !== undefined &&
        last !== undefined &&
        first[0] === last[0] &&
        first[1] === last[1]
      );
    },
    {
      message: "Polygon rings must be closed (first and last positions equal)",
    },
  );

export const PointSchema = z.object({
  type: z.literal("Point"),
  coordinates: PositionSchema,
});
export const LineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(PositionSchema).min(2),
});
/** First ring is the outer boundary; any further rings are holes. */
export const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(LinearRingSchema).min(1),
});

const PropertiesSchema = z.record(z.string(), z.unknown()).nullable();

function featureOf<G extends z.ZodType>(geometry: G) {
  return z.object({
    type: z.literal("Feature"),
    id: z.union([z.string(), z.number()]).optional(),
    geometry,
    properties: PropertiesSchema,
  });
}

export const PointFeatureSchema = featureOf(PointSchema);
export const LineStringFeatureSchema = featureOf(LineStringSchema);
export const PolygonFeatureSchema = featureOf(PolygonSchema);
export const AnyFeatureSchema = featureOf(
  z.discriminatedUnion("type", [PointSchema, LineStringSchema, PolygonSchema]),
);

export type Position = z.infer<typeof PositionSchema>;
export type PointFeature = z.infer<typeof PointFeatureSchema>;
export type LineStringFeature = z.infer<typeof LineStringFeatureSchema>;
export type PolygonFeature = z.infer<typeof PolygonFeatureSchema>;
export type AnyFeature = z.infer<typeof AnyFeatureSchema>;
