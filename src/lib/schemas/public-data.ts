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

// --- canadabuys-awards.json (evidence only; never feeds the engine) ---

export const CanadaBuysTagSchema = z.enum([
  "road",
  "utilities",
  "park",
  "building",
  "structure",
]);
export type CanadaBuysTag = z.infer<typeof CanadaBuysTagSchema>;

export const CanadaBuysAwardSchema = z.object({
  id: z.string().min(1),
  title: LocalizedTextSchema,
  buyer: z.string(),
  supplier: z.string(),
  awardDate: z.iso.date().nullable(),
  /** Contract total including taxes, CAD. */
  valueCad: z.number().positive(),
  regions: z.array(z.string()),
  /** Component types the award is comparable to, from title and GSIN/UNSPSC keywords. */
  tags: z.array(CanadaBuysTagSchema),
  url: z.url(),
});
export type CanadaBuysAward = z.infer<typeof CanadaBuysAwardSchema>;

export const CanadaBuysFileSchema = z.object({
  source: z.object({
    title: z.string(),
    publisher: z.string(),
    url: z.url(),
    files: z.array(z.url()),
    licence: z.string(),
    licenceUrl: z.url(),
    retrievedAt: IsoDateTimeSchema,
    filter: z.string(),
    limits: z.string(),
  }),
  /** Newest first. */
  awards: z.array(CanadaBuysAwardSchema),
});
export type CanadaBuysFile = z.infer<typeof CanadaBuysFileSchema>;

// --- altus-benchmarks.json (hand-transcribed; cross-check only, SPEC 8.2) ---

const PerMRangeSchema = z.tuple([z.number().positive(), z.number().positive()]);

export const AltusBenchmarksFileSchema = z.object({
  meta: z.object({
    title: z.string(),
    page: z.int().positive(),
    notes: z.string(),
    url: z.url(),
    retrievedAt: z.iso.date(),
  }),
  roads: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      perM: z.object({ gta: PerMRangeSchema, ottawa: PerMRangeSchema }),
    }),
  ),
});
export type AltusBenchmarksFile = z.infer<typeof AltusBenchmarksFileSchema>;

// --- construction-durations.json (scripts/fetch-durations.ts) ---

export const DurationFitSchema = z.object({
  n: z.int().positive(),
  /** months = k × contractValue^b */
  k: z.number().positive(),
  b: z.number(),
  /** 10th/90th percentile of actual ÷ fitted duration. */
  p10Factor: z.number().positive(),
  p90Factor: z.number().positive(),
});
export type DurationFit = z.infer<typeof DurationFitSchema>;

export const ConstructionDurationsFileSchema = z.object({
  source: z.object({
    title: z.string(),
    publisher: z.string(),
    url: z.url(),
    files: z.array(z.url()),
    licence: z.string(),
    licenceUrl: z.url(),
    retrievedAt: IsoDateTimeSchema,
    method: z.string(),
    limits: z.string(),
  }),
  fits: z.object({
    building: DurationFitSchema,
    civil: DurationFitSchema,
    all: DurationFitSchema,
  }),
});
export type ConstructionDurationsFile = z.infer<
  typeof ConstructionDurationsFileSchema
>;
