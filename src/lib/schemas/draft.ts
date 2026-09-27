import { z } from "zod";
import { ComponentTypeSchema, ParamValueSchema } from "./common";
import { CustomPricingSchema } from "./geometry";

// SPEC 9.1: the build list parsed from the landing prompt. Params use catalog ids only;
// the AI never produces costs.

export const BuildListItemSchema = z.object({
  type: ComponentTypeSchema,
  subtype: z.string().min(1),
  name: z.string().min(1),
  params: z.record(z.string(), ParamValueSchema),
  /** Prompt phrase supporting each param, keyed by param id. */
  evidence: z.record(z.string(), z.string()),
  /** e.g. "next to the library". */
  spatialHint: z.string().optional(),
  /** The phrase this component came from. */
  sourcePhrase: z.string().optional(),
  /** Parks only: park feature kinds mentioned (e.g. "playground"); placed when the layout is generated. */
  features: z.array(z.string()).optional(),
  /** Custom items only: the cost basis picked when parsing (AI or name match). */
  customPricing: CustomPricingSchema.optional(),
});
export type BuildListItem = z.infer<typeof BuildListItemSchema>;

export const ProjectDraftSchema = z.object({
  name: z.string().min(1),
  municipality: z.string().optional(),
  /** Where in the municipality, as written: "near Laurel Creek", "north end", "King and University". */
  site: z.string().max(200).optional(),
  /** ISO date guess, e.g. "2027-05-01". */
  startDate: z.iso.date().optional(),
  components: z.array(BuildListItemSchema),
});
export type ProjectDraft = z.infer<typeof ProjectDraftSchema>;

export const ParseRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  locale: z.enum(["en", "fr"]),
});
export type ParseRequest = z.infer<typeof ParseRequestSchema>;

export const ParseResponseSchema = z.object({
  draft: ProjectDraftSchema,
  /** "fallback" = keyword matcher (no key, AI down, or rate-limited). */
  source: z.enum(["ai", "fallback"]),
  /** Set when the AI was busy/unavailable, so the UI can show a small notice. */
  notice: z.enum(["ai_busy", "ai_unavailable"]).optional(),
});
export type ParseResponse = z.infer<typeof ParseResponseSchema>;
