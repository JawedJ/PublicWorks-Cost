import { describe, expect, it } from "vitest";
import { fallbackDraft, parsePrompt, toProjectDraft } from "./parse";
import { AIUnavailableError, type AIProvider, noneProvider } from "./provider";

const raw = {
  name: "Neighbourhood hub",
  municipality: "Waterloo",
  startDate: "2027-05-01",
  components: [
    {
      type: "road" as const,
      subtype: "road_reconstruction",
      name: "Local street",
      count: 2,
      sourcePhrase: "two local streets",
      spatialHint: "",
      params: [{ id: "notARealParam", value: "3", evidence: "x" }],
    },
    {
      type: "building" as const,
      subtype: "library",
      name: "Library",
      count: 1,
      sourcePhrase: "a two-storey library",
      spatialHint: "next to the park",
      params: [{ id: "storeys", value: "2", evidence: "two-storey" }],
    },
    {
      type: "building" as const,
      subtype: "spaceport",
      name: "",
      count: 99,
      sourcePhrase: "",
      spatialHint: "",
      params: [],
    },
  ],
};

describe("toProjectDraft", () => {
  it("keeps catalog params, drops unknown ones, expands counts, fixes subtypes", () => {
    const d = toProjectDraft(raw, "en");
    expect(d.municipality).toBe("Waterloo");
    expect(d.startDate).toBe("2027-05-01");
    const roads = d.components.filter((c) => c.type === "road");
    expect(roads.map((r) => r.name)).toEqual([
      "Local street 1",
      "Local street 2",
    ]);
    expect(roads[0]!.params).toEqual({});
    const lib = d.components.find((c) => c.subtype === "library")!;
    expect(lib.params.storeys).toBe(2);
    expect(lib.evidence.storeys).toBe("two-storey");
    expect(lib.spatialHint).toBe("next to the park");
    const odd = d.components.filter(
      (c) => c.subtype !== "library" && c.type === "building",
    );
    expect(odd).toHaveLength(20);
    expect(odd[0]!.subtype).not.toBe("spaceport");
  });
});

describe("parsePrompt", () => {
  const prompt = "two local streets and a two-storey library";

  it("falls back to keywords with no provider, without a notice", async () => {
    const r = await parsePrompt(prompt, "en", noneProvider);
    expect(r.source).toBe("fallback");
    expect(r.notice).toBeUndefined();
    expect(r.draft.components.length).toBe(
      fallbackDraft(prompt, "en").components.length,
    );
    expect(r.draft.components.length).toBeGreaterThanOrEqual(3);
  });

  it("flags a busy AI on rate limit", async () => {
    const busy: AIProvider = {
      ...noneProvider,
      name: "busy",
      generateStructured: () =>
        Promise.reject(new AIUnavailableError("rate_limited")),
    };
    const r = await parsePrompt(prompt, "en", busy);
    expect(r).toMatchObject({ source: "fallback", notice: "ai_busy" });
  });

  it("uses validated AI output when available", async () => {
    const ok: AIProvider = {
      ...noneProvider,
      name: "ok",
      generateStructured: async () => raw as never,
    };
    const r = await parsePrompt(prompt, "en", ok);
    expect(r.source).toBe("ai");
    expect(r.draft.name).toBe("Neighbourhood hub");
  });
});
