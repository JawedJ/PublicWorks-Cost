import { getAIProvider } from "@/lib/ai";
import { askQuestions } from "@/lib/ai/questions";
import { jsonRoute, rateLimiters } from "@/lib/api";
import { QuestionsRequestSchema } from "@/lib/schemas";

// P7.5 (SPEC 9.2): smart follow-up questions across the project. Always answers:
// falls back to the cost-impact ranking when the AI is missing, busy, or returns bad output.

export const POST = jsonRoute(
  {
    name: "ai/questions",
    body: QuestionsRequestSchema,
    rateLimit: rateLimiters.ai,
  },
  ({ body }) => askQuestions(body, getAIProvider()),
);
