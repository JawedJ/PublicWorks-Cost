import { z } from "zod";
import {
  ComponentTypeSchema,
  ParamSourceSchema,
  ParamValueSchema,
} from "./common";

// SPEC 9.2: smart follow-up questions across the whole project. Each question
// names a real component and catalog param; the AI only picks and explains,
// the answer goes into the param like any other edit.

export const QuestionSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  paramId: z.string().min(1),
  /** One sentence, tailored to this project. */
  reason: z.string().min(1),
  /** Pre-selected answer (valid for the param). */
  suggested: ParamValueSchema,
  /** Other components of the same type with the same unanswered param ("apply to all similar"). */
  alsoApplies: z.array(z.string()),
});
export type Question = z.infer<typeof QuestionSchema>;

/** What the client sends: a compact summary of each drawn component. */
export const QuestionsRequestSchema = z.object({
  municipality: z.string().max(200).optional(),
  components: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().max(200),
        type: ComponentTypeSchema,
        subtype: z.string().max(100),
        /** Share of project P50, 0–1. */
        share: z.number().min(0).max(1),
        params: z.record(z.string(), ParamValueSchema),
        sources: z.record(z.string(), ParamSourceSchema),
        /** Existing buildings standing where it goes (from the site lookup). */
        existing: z
          .object({
            count: z.int().min(0),
            floorAreaM2: z.number().min(0),
          })
          .optional(),
        /** Site flag codes on it (e.g. near_school), so reviews are asked only there. */
        siteFlags: z.array(z.string().max(40)).max(20).optional(),
      }),
    )
    .max(60),
  /** Short site notes, e.g. "Laurel Creek within 30 m of the culvert". */
  siteNotes: z.array(z.string().max(300)).max(20).default([]),
});
export type QuestionsRequest = z.infer<typeof QuestionsRequestSchema>;

export const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionSchema),
  source: z.enum(["ai", "fallback"]),
  notice: z.enum(["ai_busy", "ai_unavailable"]).optional(),
});
export type QuestionsResponse = z.infer<typeof QuestionsResponseSchema>;
