import { z } from "zod";
import {
  ComponentTypeSchema,
  EstimateClassSchema,
  IsoDateTimeSchema,
  LocalizedTextSchema,
  NonNegativeSchema,
  PriceCategorySchema,
  PriceRangeSchema,
  UnitSchema,
} from "./common";

export const LineItemCategorySchema = z.enum([
  "earthworks",
  "paving",
  "concrete",
  "watermain",
  "sewer",
  "lighting",
  "landscaping",
  "park_features",
  "building",
  "site_works",
  "structures",
  "traffic_control",
  "demolition",
  "custom",
  "mobilization",
  "general",
]);
export type LineItemCategory = z.infer<typeof LineItemCategorySchema>;

export const LineItemSchema = z.object({
  id: z.string().min(1),
  /** null for project-level items (e.g. the single mobilization allowance). */
  componentId: z.string().nullable(),
  /** Lets views show the cost of one building section or park feature. */
  elementRef: z
    .object({
      sectionId: z.string().optional(),
      featureId: z.string().optional(),
    })
    .optional(),
  category: LineItemCategorySchema,
  description: LocalizedTextSchema,
  quantity: NonNegativeSchema,
  unit: UnitSchema,
  /** e.g. "From drawn line: 812 m". */
  quantitySource: LocalizedTextSchema,
  /** After regional factor, escalation, and scenario shocks. */
  unitPrice: PriceRangeSchema,
  /** e.g. "Sample Ontario unit price, 2025, typical" or "User-entered rate". */
  unitPriceSource: LocalizedTextSchema,
  priceCategory: PriceCategorySchema,
  total: NonNegativeSchema,
  isQuantityOverridden: z.boolean(),
  isPriceOverridden: z.boolean(),
  /** Custom elements and other items priced beyond known cost data (SPEC 6.5). */
  lowConfidence: z.boolean(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const FlagSchema = z.object({
  id: z.string().min(1),
  /** Stable machine id, e.g. 'waterway_permit', 'winter_paving'. */
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "high"]),
  title: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
  costEffect: LocalizedTextSchema.optional(),
  /** Every flag names the component(s) it applies to; empty only for project-wide flags. */
  componentIds: z.array(z.string()),
  /** Where A draws the marker on the map, if the flag has a place. */
  location: z.object({ lng: z.number(), lat: z.number() }).optional(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const ImprovementHintSchema = z.object({
  componentId: z.string(),
  paramId: z.string(),
  label: LocalizedTextSchema,
});
export type ImprovementHint = z.infer<typeof ImprovementHintSchema>;

export const ComponentEstimateSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  type: ComponentTypeSchema,
  directCost: NonNegativeSchema,
  /** From the same simulation as the project; component percentiles don't sum to project percentiles. */
  p10: NonNegativeSchema,
  p50: NonNegativeSchema,
  p90: NonNegativeSchema,
  estimateClass: EstimateClassSchema,
  /** Share of project P50, 0–1. */
  share: z.number().min(0).max(1),
  /** Answers that would raise this component's class. */
  improvementHints: z.array(ImprovementHintSchema),
  /** Typical construction time from its cost (CanadaBuys contract durations). */
  durationMonths: z.number().positive().optional(),
});
export type ComponentEstimate = z.infer<typeof ComponentEstimateSchema>;

export const EscalationDetailSchema = z.object({
  /** Price year -> latest BCPI quarter; 1 when skipped. */
  bcpiFactor: z.number().positive(),
  /** e.g. "StatCan BCPI, Toronto, non-residential: +6.1% since 2025 Q2". */
  bcpiLabel: LocalizedTextSchema.optional(),
  /** True when a road/park/structure uses the non-residential series as a proxy. */
  isProxy: z.boolean(),
  /** Today -> construction midpoint, annual fraction. */
  annualRate: z.number(),
  annualRateSource: z.enum(["bcpi_trailing_8q", "fallback_default", "user"]),
});
export type EscalationDetail = z.infer<typeof EscalationDetailSchema>;

export const EstimateSchema = z.object({
  components: z.array(ComponentEstimateSchema),
  undrawnComponents: z.int().min(0),
  lineItems: z.array(LineItemSchema),
  subtotals: z.partialRecord(LineItemCategorySchema, NonNegativeSchema),
  directCost: NonNegativeSchema,
  softCosts: z.object({
    engineering: NonNegativeSchema,
    contractAdmin: NonNegativeSchema,
    permitsApprovals: NonNegativeSchema,
    projectManagement: NonNegativeSchema,
    ffe: NonNegativeSchema.optional(),
  }),
  escalation: z.number(),
  escalationDetail: EscalationDetailSchema,
  taxes: NonNegativeSchema,
  /** Before contingency. */
  baseEstimate: NonNegativeSchema,
  estimateClass: EstimateClassSchema,
  /** Percent, e.g. { lowPct: -30, highPct: 50 }. */
  classRange: z.object({ lowPct: z.number(), highPct: z.number() }),
  distribution: z.object({
    p10: NonNegativeSchema,
    p50: NonNegativeSchema,
    p80: NonNegativeSchema,
    p90: NonNegativeSchema,
    /** `bin` is the lower edge of the bin, in CAD. */
    histogram: z.array(z.object({ bin: z.number(), count: z.int().min(0) })),
  }),
  recommendedContingency: z.object({
    amount: NonNegativeSchema,
    pct: NonNegativeSchema,
  }),
  overrunRisk: z.object({
    probabilityOfOverrun: z.number().min(0).max(1),
    typicalOverrunPct: z.number(),
    referenceNote: LocalizedTextSchema,
  }),
  /** Tornado data, top 8, change in project P50. */
  drivers: z.array(
    z.object({
      id: z.string(),
      label: LocalizedTextSchema,
      componentId: z.string().optional(),
      impactLow: z.number(),
      impactHigh: z.number(),
    }),
  ),
  flags: z.array(FlagSchema),
  /** Construction time: longest component (after its start offset). */
  schedule: z
    .object({
      months: z.number().positive(),
      p10Months: z.number().positive(),
      p90Months: z.number().positive(),
      source: LocalizedTextSchema,
    })
    .optional(),
  perUnitMetrics: z.object({
    perM: NonNegativeSchema.optional(),
    perM2: NonNegativeSchema.optional(),
    perM2GFA: NonNegativeSchema.optional(),
  }),
  sampleData: z.boolean(),
  seed: z.int(),
  computedAt: IsoDateTimeSchema,
});
export type Estimate = z.infer<typeof EstimateSchema>;
