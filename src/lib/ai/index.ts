import { createGeminiProvider } from "./gemini";
import { type AIProvider, noneProvider } from "./provider";

export * from "./provider";

/** Picks the provider from env (server only). Missing key → `none`, so callers fall back. */
export function getAIProvider(): AIProvider {
  const name = process.env.AI_PROVIDER || "gemini";
  if (name === "gemini" && process.env.GEMINI_API_KEY)
    return createGeminiProvider(process.env.GEMINI_API_KEY);
  // TODO(P7.1 polish): AnthropicProvider.
  return noneProvider;
}
