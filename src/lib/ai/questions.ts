import { z } from "zod";
import {
  candidates,
  coerceAnswer,
  fallbackQuestions,
  MAX_QUESTIONS,
  toQuestion,
} from "@/lib/questions/rank";
import type { QuestionsRequest, QuestionsResponse } from "@/lib/schemas";
import { type AIProvider, AIUnavailableError } from "./provider";

// P7.5 (SPEC 9.2): the AI picks up to 8 questions from the ranked candidates and
// tailors the reason to this project. It can't invent params: it answers with
// candidate ids, which are validated. No costs, ever.

/** Candidates offered to the AI (it chooses among these). */
const OFFER = 20;

const AiQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      candidateId: z.string(),
      reason: z.string(),
      suggested: z.string(),
    }),
  ),
});

const SYSTEM = `You help a Canadian municipal cost estimator decide which follow-up questions to ask about a planned public works project.
You get the project's components and a list of candidate questions (unanswered parameters), already roughly ranked by cost impact.
Pick up to ${MAX_QUESTIONS} candidates that would most improve the estimate, most important first. Prefer big-ticket components and parameters that change cost a lot. Skip near-duplicates.
For each: return its candidateId exactly as given, a reason (one plain sentence, under 25 words, about the project as a whole: each question applies to every component listed with it (alsoAppliesToCount), so don't single out one component; say why the answer changes cost), and "suggested": the most likely answer as a string (for enum: one of the option values; for boolean: "true" or "false"; for number: a number within min–max).
If a candidate has a siteFinding, always pick it and base the reason on that finding.
Never state or estimate costs, prices or dollar amounts.`;

const cache = new Map<string, QuestionsResponse>();

export async function askQuestions(
  req: QuestionsRequest,
  provider: AIProvider,
): Promise<QuestionsResponse> {
  const ranked = candidates(req);
  if (ranked.length === 0) return { questions: [], source: "fallback" };
  const offered = ranked.slice(0, OFFER);

  const key = `${provider.name}:${JSON.stringify(req)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const prompt = JSON.stringify({
    municipality: req.municipality,
    siteNotes: req.siteNotes,
    components: req.components.map((c) => ({
      name: c.name,
      type: c.type,
      subtype: c.subtype,
      shareOfCost: Math.round(c.share * 100) + "%",
    })),
    candidates: offered.map((c) => ({
      candidateId: c.id,
      component: c.componentName,
      alsoAppliesToCount: c.alsoApplies.length,
      param: c.def.label.en,
      type: c.def.type,
      ...(c.def.options && { options: c.def.options.map((o) => o.value) }),
      ...(c.def.min !== undefined && { min: c.def.min }),
      ...(c.def.max !== undefined && { max: c.def.max }),
      ...(c.def.unit && { unit: c.def.unit }),
      currentDefault: c.suggested,
      costImpact: c.def.costImpact,
      why: c.def.why.en,
      ...(c.reason && { siteFinding: c.reason }),
    })),
  });

  try {
    const raw = await provider.generateStructured({
      system: SYSTEM,
      prompt,
      schema: AiQuestionsSchema,
      fast: true,
    });
    const byId = new Map(offered.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const questions = raw.questions
      .filter((q) => byId.has(q.candidateId) && !seen.has(q.candidateId))
      .slice(0, MAX_QUESTIONS)
      .map((q) => {
        seen.add(q.candidateId);
        const c = byId.get(q.candidateId)!;
        const suggested = coerceAnswer(c.def, q.suggested) ?? c.suggested;
        return toQuestion(c, q.reason.trim(), suggested);
      });
    // Existing buildings in the way are always asked, even if the AI skipped them.
    const missed = offered.filter(
      (c) => c.def.id === "demolishExisting" && !seen.has(c.id),
    );
    if (questions.length && missed.length)
      questions.unshift(...missed.map((c) => toQuestion(c)));
    questions.splice(MAX_QUESTIONS);
    // An empty or all-invalid pick falls back to the ranking.
    const result: QuestionsResponse = {
      questions: questions.length ? questions : fallbackQuestions(req),
      source: questions.length ? "ai" : "fallback",
    };
    if (cache.size > 200) cache.clear();
    cache.set(key, result);
    return result;
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    if (err.reason !== "no_provider")
      console.warn("ai/questions fallback:", err.message);
    return {
      questions: fallbackQuestions(req),
      source: "fallback",
      ...(err.reason === "rate_limited"
        ? { notice: "ai_busy" as const }
        : err.reason !== "no_provider" && {
            notice: "ai_unavailable" as const,
          }),
    };
  }
}
