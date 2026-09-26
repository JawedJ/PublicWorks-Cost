import { jsonRoute, rateLimiters } from "@/lib/api";
import { ZoningRequestSchema } from "@/lib/schemas";
import { lookupZones } from "@/lib/zoning/lookup";

// SPEC 8.3 (MVP): the zone at each building, from the city's public zoning map.
// Always answers: points no service covers come back "no_data", failures "error".

export const POST = jsonRoute(
  { name: "zoning", body: ZoningRequestSchema, rateLimit: rateLimiters.geo },
  ({ body }) => lookupZones(body),
);
