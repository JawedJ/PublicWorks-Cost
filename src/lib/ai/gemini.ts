import { z } from "zod";
import { type AIFile, type AIProvider, AIUnavailableError } from "./provider";

// Gemini via the REST API (no SDK dependency). Structured output uses the
// response JSON schema; output is validated with zod and retried once.

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 30_000;
/** Reading a document (e.g. a 40-page PDF) takes longer. */
const FILE_TIMEOUT_MS = 90_000;

export function createGeminiProvider(apiKey: string): AIProvider {
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const fastModel = process.env.GEMINI_MODEL_FAST || "gemini-flash-lite-latest";

  async function call(opts: {
    system: string;
    prompt: string;
    fast?: boolean;
    jsonSchema?: unknown;
    files?: AIFile[];
  }): Promise<string> {
    const send = (useModel = opts.fast ? fastModel : model) =>
      fetch(`${API}/${useModel}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [
            {
              role: "user",
              parts: [
                ...(opts.files ?? []).map((f) => ({
                  inlineData: { mimeType: f.mimeType, data: f.dataBase64 },
                })),
                { text: opts.prompt },
              ],
            },
          ],
          generationConfig: opts.jsonSchema
            ? {
                responseMimeType: "application/json",
                responseJsonSchema: opts.jsonSchema,
              }
            : undefined,
        }),
        signal: AbortSignal.timeout(
          opts.files?.length ? FILE_TIMEOUT_MS : TIMEOUT_MS,
        ),
      });
    let res: Response;
    try {
      res = await send();
      // 503 = model briefly overloaded (common); one retry usually succeeds.
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await send();
      }
      // Still overloaded: the lighter model is usually available.
      if (res.status === 503 && !opts.fast) res = await send(fastModel);
    } catch {
      throw new AIUnavailableError("timeout");
    }
    if (res.status === 429) throw new AIUnavailableError("rate_limited");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AIUnavailableError(
        "error",
        `Gemini ${res.status}: ${detail.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!text) throw new AIUnavailableError("error", "Empty Gemini response");
    return text;
  }

  return {
    name: "gemini",
    generateText: (opts) => call(opts),
    async generateStructured({ schema, ...opts }) {
      const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema, {
        target: "draft-2020-12",
      });
      delete jsonSchema.$schema;
      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await call({ ...opts, jsonSchema });
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          continue;
        }
        const result = schema.safeParse(parsed);
        if (result.success) return result.data;
      }
      throw new AIUnavailableError("invalid_output");
    },
  };
}
