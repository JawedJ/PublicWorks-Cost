import { z } from "zod";
import { ComponentTypeSchema, ParamValueSchema } from "./common";

// SPEC 9.3: document extraction. The user uploads a report (e.g. a geotechnical
// report); the AI proposes catalog parameter values with evidence; the user
// reviews each one before it's applied. The file itself is never stored.

/** 10 MB file → about 13.4 MB as base64. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ExtractRequestSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(["application/pdf", "text/plain"]),
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 4),
  components: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        type: ComponentTypeSchema,
        subtype: z.string(),
      }),
    )
    .min(1)
    .max(200),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractFindingSchema = z.object({
  /** Stable key for the review list. */
  id: z.string(),
  paramId: z.string(),
  value: ParamValueSchema,
  /** Components the value applies to (all of one type, or specific ones). */
  componentIds: z.array(z.string()).min(1),
  /** Short quote from the document. */
  evidence: z.string(),
  /** 1-based page, when the document has pages. */
  page: z.int().positive().optional(),
});
export type ExtractFinding = z.infer<typeof ExtractFindingSchema>;

export const ExtractResponseSchema = z.object({
  /** One line on what the document is, e.g. "Geotechnical report, 3 boreholes". */
  summary: z.string(),
  findings: z.array(ExtractFindingSchema),
  source: z.enum(["ai", "fallback"]),
  notice: z.enum(["ai_busy", "ai_unavailable"]).optional(),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
