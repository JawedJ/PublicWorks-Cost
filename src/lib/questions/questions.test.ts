import { describe, expect, it } from "vitest";
import { askQuestions } from "@/lib/ai/questions";
import {
  type AIProvider,
  AIUnavailableError,
  noneProvider,
} from "@/lib/ai/provider";
import {
  northgateEstimate as est,
  northgateProject as p,
} from "@/lib/fixtures";
import type { QuestionsRequest } from "@/lib/schemas";
import {
  candidates,
  coerceAnswer,
  fallbackQuestions,
  MAX_QUESTIONS,
} from "./rank";

const shares = new Map(est.components.map((c) => [c.componentId, c.share]));
const req: QuestionsRequest = {
  municipality: p.municipality,
  siteNotes: [],
  components: p.components
    .filter((c) => shares.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      subtype: c.subtype,
      share: shares.get(c.id)!,
      params: c.params,
      sources: Object.fromEntries(
        Object.entries(c.paramMeta).map(([k, m]) => [k, m.source]),
      ),
    })),
};
const name = (id: string) => p.components.find((c) => c.id === id)!.name;

function fake(output: unknown): AIProvider {
  return {
    name: "fake",
    generateText: async () => "",
    generateStructured: async () => output as never,
  };
}

describe("question ranking (fallback)", () => {
  it("asks about big-ticket components first, skips answered params", () => {
    const qs = fallbackQuestions(req);
    expect(qs.length).toBe(MAX_QUESTIONS);
    // The library and fire station are ~80% of cost.
    expect(["Northgate Branch Library", "Fire Station 7"]).toContain(
      name(qs[0]!.componentId),
    );
    for (const q of qs) {
      const c = req.components.find((x) => x.id === q.componentId)!;
      expect(c.sources[q.paramId] ?? "default").toBe("default");
    }
  });

  it("asks general questions: once per type + param for the whole project", () => {
    const soil = candidates(req).find(
      (c) => c.def.id === "soilCondition" && c.type === "road",
    )!;
    expect(soil.alsoApplies).toHaveLength(1); // two streets
    // All buildings share one question, whatever kind they are.
    const basement = candidates(req).filter(
      (c) => c.type === "building" && c.def.id === "basement",
    );
    expect(basement).toHaveLength(1);
    expect(
      [basement[0]!.componentId, ...basement[0]!.alsoApplies].map(name).sort(),
    ).toEqual(["Fire Station 7", "Northgate Branch Library"]);
  });

  it("skips params the drawing answers and irrelevant special spaces", () => {
    const ids = candidates(req)
      .filter((c) => name(c.componentId) === "Northgate Branch Library")
      .map((c) => c.def.id);
    expect(ids).not.toContain("gfaOverrideM2");
    expect(ids).not.toContain("indoorPool");
    expect(ids).not.toContain("iceRink");
    expect(ids).not.toContain("apparatusBays");
    const fire = candidates(req)
      .filter((c) => name(c.componentId) === "Fire Station 7")
      .map((c) => c.def.id);
    expect(fire).not.toContain("gymnasium");
  });

  it("coerces answers to the param's type", () => {
    const soil = candidates(req).find((c) => c.def.id === "soilCondition")!.def;
    expect(coerceAnswer(soil, "poor")).toBe("poor");
    expect(coerceAnswer(soil, "lava")).toBeNull();
    const lanes = candidates(req).find((c) => c.def.id === "lanes")?.def;
    if (lanes) expect(coerceAnswer(lanes, "99")).toBe(lanes.max);
  });
});

describe("askQuestions", () => {
  it("uses the AI's pick and reason, validated against the candidates", async () => {
    const [first, second] = candidates(req);
    const res = await askQuestions(
      req,
      fake({
        questions: [
          {
            candidateId: second!.id,
            reason: "Tailored reason.",
            suggested: "nonsense",
          },
          { candidateId: "made:up", reason: "x", suggested: "1" },
          {
            candidateId: first!.id,
            reason: "Another.",
            suggested: String(first!.suggested),
          },
        ],
      }),
    );
    expect(res.source).toBe("ai");
    expect(res.questions.map((q) => q.id)).toEqual([second!.id, first!.id]);
    expect(res.questions[0]!.reason).toBe("Tailored reason.");
    // Invalid suggestion falls back to the current default.
    expect(res.questions[0]!.suggested).toBe(second!.suggested);
  });

  it("falls back to the ranking without a provider, or with a notice when busy", async () => {
    const none = await askQuestions(req, noneProvider);
    expect(none).toMatchObject({ source: "fallback" });
    expect(none.notice).toBeUndefined();
    expect(none.questions).toEqual(fallbackQuestions(req));
    const busy: AIProvider = {
      ...fake(null),
      name: "busy",
      generateStructured: async () => {
        throw new AIUnavailableError("rate_limited");
      },
    };
    expect(await askQuestions(req, busy)).toMatchObject({
      source: "fallback",
      notice: "ai_busy",
    });
  });
});

describe("site-specific questions", () => {
  it("asks first about existing buildings in the way, with what was found", () => {
    const b = req.components.find((c) => c.type === "building")!;
    const withSite: QuestionsRequest = {
      ...req,
      components: req.components.map((c) =>
        c.id === b.id ? { ...c, existing: { count: 2, floorAreaM2: 850 } } : c,
      ),
    };
    const q = fallbackQuestions(withSite)[0]!;
    expect(q.paramId).toBe("demolishExisting");
    expect(q.componentId).toBe(b.id);
    expect(q.reason).toContain("850 m²");
    // Not asked where nothing is in the way.
    expect(
      fallbackQuestions(req).some((x) => x.paramId === "demolishExisting"),
    ).toBe(false);
  });

  it("only asks structure inputs that fit the kind of structure", () => {
    for (const c of candidates(req))
      if (c.subtype === "culvert_replacement")
        expect(["spanM", "lengthM", "fishHabitat"]).toContain(c.def.id);
  });
});
