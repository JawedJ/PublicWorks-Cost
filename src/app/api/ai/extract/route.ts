import { getAIProvider } from "@/lib/ai";
import { extractDocument } from "@/lib/ai/extract";
import { jsonRoute, rateLimiters } from "@/lib/api";
import { ExtractRequestSchema, MAX_DOCUMENT_BYTES } from "@/lib/schemas";

// P7.6 (SPEC 9.3): read an uploaded report and propose parameter values for
// review. The file is only passed to the AI provider; it is never stored.

export const maxDuration = 120;

export const POST = jsonRoute(
  {
    name: "ai/extract",
    body: ExtractRequestSchema,
    rateLimit: rateLimiters.ai,
    // Base64 of a 10 MB file plus the component list.
    maxBodyBytes: Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 200_000,
  },
  ({ body }) => extractDocument(body, getAIProvider()),
);
