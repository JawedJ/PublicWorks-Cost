import { z } from "zod";
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  LocaleSchema,
  RegionKeySchema,
} from "./common";
import { ComponentSchema } from "./component";
import { PolygonFeatureSchema } from "./geojson";
import { ScenarioSchema } from "./scenario";
import { SiteContextSchema } from "./site-context";
import { ZoningContextSchema } from "./zoning";

/** Bump when the Project shape changes incompatibly; project files carry it (SPEC 15). */
export const CURRENT_SCHEMA_VERSION = 1;

export const ProjectSettingsSchema = z
  .object({
    startDate: IsoDateSchema,
    durationMonths: z.int().min(1).max(120),
    /** Annual rate as a fraction, e.g. 0.04 = 4%/yr. */
    escalationRate: z.number().min(-0.2).max(0.5),
    /** Net HST after municipal rebate, as a fraction. */
    taxRate: z.number().min(0).max(0.2),
    contingencyMode: z.enum(["recommended", "manual"]),
    /** Percent, e.g. 15 = 15%. Required when contingencyMode is 'manual'. */
    manualContingencyPct: z.number().min(0).max(100).optional(),
    locale: LocaleSchema,
  })
  .superRefine((s, ctx) => {
    if (
      s.contingencyMode === "manual" &&
      s.manualContingencyPct === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["manualContingencyPct"],
        message: "Manual contingency needs a percentage",
      });
    }
  });
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectSchema = z
  .object({
    schemaVersion: z.int().positive(),
    id: z.uuid(),
    name: z.string().min(1),
    /** The original general prompt for the whole build. */
    description: z.string(),
    municipality: z.string(),
    region: RegionKeySchema,
    location: z.object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
      zoom: z.number().min(0).max(24),
    }),
    areaBoundary: PolygonFeatureSchema.optional(),
    components: z.array(ComponentSchema),
    settings: ProjectSettingsSchema,
    /** Baseline is scenarios[0]. */
    scenarios: z.array(ScenarioSchema).min(1),
    activeScenarioId: z.string().min(1),
    siteContext: SiteContextSchema.optional(),
    /** Zone of each building (SPEC 8.3); advisory flags only. */
    zoningContext: ZoningContextSchema.optional(),
    /** Metadata only; file contents are never stored. */
    documents: z.array(
      z.object({
        name: z.string(),
        pageCount: z.int().positive().optional(),
        extractedAt: IsoDateTimeSchema,
      }),
    ),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((p, ctx) => {
    if (!p.scenarios.some((s) => s.id === p.activeScenarioId)) {
      ctx.addIssue({
        code: "custom",
        path: ["activeScenarioId"],
        message: "Active scenario not found",
      });
    }
    const ids = new Set<string>();
    const allComponents = [
      ...p.components,
      ...p.scenarios.flatMap((s) => s.addedComponents),
    ];
    for (const c of allComponents) {
      if (ids.has(c.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["components"],
          message: `Duplicate component id: ${c.id}`,
        });
      }
      ids.add(c.id);
    }
  });
export type Project = z.infer<typeof ProjectSchema>;
