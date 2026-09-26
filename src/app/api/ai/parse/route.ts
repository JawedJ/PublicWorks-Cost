import { getAIProvider } from "@/lib/ai";
import { parsePrompt } from "@/lib/ai/parse";
import { jsonRoute, rateLimiters } from "@/lib/api";
import { ParseRequestSchema } from "@/lib/schemas";

// P7.2 (SPEC 9.1): whole-build prompt → build list. Always answers: falls back to
// the keyword matcher when the AI is missing, busy, or returns bad output.

export const POST = jsonRoute(
  { name: "ai/parse", body: ParseRequestSchema, rateLimit: rateLimiters.ai },
  ({ body }) => parsePrompt(body.prompt, body.locale, getAIProvider()),
);
