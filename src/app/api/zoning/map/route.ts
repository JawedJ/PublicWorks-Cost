import { z } from "zod";
import { jsonRoute, rateLimiters } from "@/lib/api";
import { waterlooZonesIn } from "@/lib/zoning/waterloo";

// Zone polygons inside a box, for a zoning map layer (Waterloo, from the committed
// snapshot). Capped at 800 zones; a box wider than ~5 km returns nothing.

const Body = z.object({
  bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .refine(([w, s, e, n]) => e > w && n > s, "Invalid box"),
});

export const POST = jsonRoute(
  { name: "zoning/map", body: Body, rateLimit: rateLimiters.geo },
  ({ body }) => {
    const [w, s, e, n] = body.bbox;
    const tooBig = e - w > 0.07 || n - s > 0.05;
    return {
      type: "FeatureCollection" as const,
      features: tooBig ? [] : waterlooZonesIn(body.bbox),
    };
  },
);
