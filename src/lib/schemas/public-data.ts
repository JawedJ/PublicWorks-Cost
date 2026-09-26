import { z } from "zod";
import { IsoDateTimeSchema, LocalizedTextSchema } from "./common";

// Schemas for the real public datasets fetched by scripts/ (SPEC 8.1).

const KeyedNameSchema = z.object({
  key: z.string().min(1),
  name: LocalizedTextSchema,
});

/** "2026Q2" */
export const QuarterSchema = z.string().regex(/^\d{4}Q[1-4]$/);

// --- statcan-bcpi.json (table 18-10-0289-01) ---

export const BcpiFileSchema = z.object({
  source: z.object({
    title: LocalizedTextSchema,
    publisher: z.string(),
    tableId: z.string(),
    url: z.url(),
    licence: z.string(),
    licenceUrl: z.url(),
    base: z.string(),
    releaseTime: z.string(),
    retrievedAt: IsoDateTimeSchema,
  }),
  /** Keys match `referenceCma` in regional-factors.json. */
  geographies: z.array(KeyedNameSchema),
  buildingTypes: z.array(KeyedNameSchema),
  divisions: z.array(KeyedNameSchema),
  series: z.array(
    z.object({
      geo: z.string(),
      type: z.string(),
      division: z.string(),
      /** Oldest first. */
      points: z.array(z.tuple([QuarterSchema, z.number().positive()])).min(1),
    }),
  ),
});
export type BcpiFile = z.infer<typeof BcpiFileSchema>;
