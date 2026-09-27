import { z } from "zod";
import { templates } from "@/engine/templates";
import { coerceAnswer } from "@/lib/questions/rank";
import type {
  ComponentType,
  ExtractFinding,
  ExtractRequest,
  ExtractResponse,
} from "@/lib/schemas";
import { type AIProvider, AIUnavailableError } from "./provider";

// P7.6 (SPEC 9.3): read an uploaded report (e.g. a geotechnical report) and
// propose catalog parameter values with evidence. The AI only picks param ids
// and values from the catalog; every value is validated here, and the user
// reviews each one before it's applied. No costs, ever.

/** Sizes come from the drawing, not from documents. */
const SKIP = new Set(["gfaOverrideM2", "areaM2"]);

const AiExtractSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      paramId: z.string(),
      value: z.string(),
      /** Component ids from the list, or "all:<type>" for every component of a type. */
      appliesTo: z.array(z.string()),
      evidence: z.string(),
      page: z.int(),
    }),
  ),
});

const SYSTEM = `You read documents for a Canadian municipal cost estimator (e.g. geotechnical reports, site surveys, previous studies, drawings).
You get the project's components and, per component type, the parameters the estimator uses (id, type, allowed values).
Find every parameter value the document clearly states or strongly implies, for example soil condition (good / average / poor), bedrock depth (rockExpected), groundwater, excavation depth, fish habitat in a watercourse, culvert span, building basement or site servicing.
For each finding return:
- paramId: exactly one of the listed ids for that type;
- value: as text (enum: one of the listed values; boolean: "true" or "false"; number: a number in the listed unit);
- appliesTo: the component ids it applies to, or "all:<type>" (e.g. "all:road") when the document covers the whole site;
- evidence: a short quote (under 25 words) from the document;
- page: the page number where it appears (0 if unknown).
Only report what the document supports. Skip anything not in the parameter list. Never state or estimate costs.
summary: one short line saying what the document is (e.g. "Geotechnical report, 6 boreholes along Main St").`;

function catalogText(types: ComponentType[]): string {
  return types
    .map((type) => {
      const params = templates[type].paramCatalog
        .filter((d) => !SKIP.has(d.id))
        .map((d) => {
          const detail =
            d.type === "enum"
              ? `one of ${d.options?.map((o) => o.value).join("|")}`
              : d.type === "number"
                ? `number${d.unit ? ` in ${d.unit}` : ""}`
                : "true|false";
          return `  - ${d.id} (${detail}): ${d.label.en}`;
        })
        .join("\n");
      return `type ${type}:\n${params}`;
    })
    .join("\n\n");
}

/** Validates the model's findings against the components and catalogs. */
export function toFindings(
  raw: z.infer<typeof AiExtractSchema>["findings"],
  components: ExtractRequest["components"],
): ExtractFinding[] {
  const out: ExtractFinding[] = [];
  raw.forEach((f, i) => {
    const ids = new Set<string>();
    for (const a of f.appliesTo) {
      const all = a.match(/^all:(\w+)$/)?.[1];
      for (const c of components)
        if (all ? c.type === all : c.id === a) ids.add(c.id);
    }
    // Only components whose catalog has this param; the value must be valid for it.
    const targets = components.filter(
      (c) =>
        ids.has(c.id) &&
        !SKIP.has(f.paramId) &&
        templates[c.type].paramCatalog.some((d) => d.id === f.paramId),
    );
    const def = targets[0]
      ? templates[targets[0].type].paramCatalog.find((d) => d.id === f.paramId)
      : undefined;
    const value = def ? coerceAnswer(def, f.value) : null;
    if (!def || value === null) return;
    out.push({
      id: `${i}:${f.paramId}`,
      paramId: f.paramId,
      value,
      componentIds: targets.map((c) => c.id),
      evidence: f.evidence.trim().slice(0, 300),
      ...(f.page > 0 && { page: f.page }),
    });
  });
  return out;
}

/** Deterministic fallback for plain-text files: soil and bedrock keywords, applied to every road. */
export function keywordFindings(
  text: string,
  components: ExtractRequest["components"],
): ExtractFinding[] {
  const roads = components.filter((c) => c.type === "road").map((c) => c.id);
  if (!roads.length) return [];
  const quote = (re: RegExp) => {
    const m = re.exec(text);
    if (!m) return null;
    const start = Math.max(0, text.lastIndexOf(".", m.index) + 1);
    const end = text.indexOf(".", m.index);
    return text
      .slice(start, end < 0 ? undefined : end + 1)
      .trim()
      .slice(0, 200);
  };
  const out: ExtractFinding[] = [];
  const poor = quote(
    /\b(soft|organic|peat|high groundwater|loose|wet)\b[^.]*\b(clay|silt|soil|sand|fill)\b/i,
  );
  const good = quote(
    /\b(dense|stiff|compact)\b[^.]*\b(till|sand|gravel|clay)\b/i,
  );
  if (poor || good)
    out.push({
      id: "kw:soilCondition",
      paramId: "soilCondition",
      value: poor ? "poor" : "good",
      componentIds: roads,
      evidence: (poor ?? good)!,
    });
  const rock = quote(
    /\b(bedrock|limestone|shale|dolostone|rock)\b[^.]*\b(encountered|at a depth|at depth|m below)\b/i,
  );
  if (rock)
    out.push({
      id: "kw:rockExpected",
      paramId: "rockExpected",
      value: true,
      componentIds: roads,
      evidence: rock,
    });
  return out;
}

export async function extractDocument(
  req: ExtractRequest,
  provider: AIProvider,
): Promise<ExtractResponse> {
  const types = [...new Set(req.components.map((c) => c.type))].filter(
    (t) => t !== "custom",
  );
  try {
    const raw = await provider.generateStructured({
      system: SYSTEM,
      prompt: `Components:\n${req.components
        .map((c) => `- ${c.id}: ${c.name} (${c.type}, ${c.subtype})`)
        .join(
          "\n",
        )}\n\nParameters by type:\n${catalogText(types)}\n\nDocument: ${req.fileName}`,
      schema: AiExtractSchema,
      files: [{ mimeType: req.mimeType, dataBase64: req.dataBase64 }],
    });
    return {
      summary: raw.summary.trim().slice(0, 200),
      findings: toFindings(raw.findings, req.components),
      source: "ai",
    };
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    if (err.reason !== "no_provider")
      console.warn("ai/extract fallback:", err.message);
    const text =
      req.mimeType === "text/plain"
        ? Buffer.from(req.dataBase64, "base64").toString("utf8")
        : "";
    return {
      summary: "",
      findings: keywordFindings(text, req.components),
      source: "fallback",
      ...(err.reason === "rate_limited"
        ? { notice: "ai_busy" as const }
        : { notice: "ai_unavailable" as const }),
    };
  }
}
