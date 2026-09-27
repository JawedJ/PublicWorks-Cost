import { describe, expect, it } from "vitest";
import { extractDocument, keywordFindings, toFindings } from "./extract";
import { AIUnavailableError, type AIProvider, noneProvider } from "./provider";

const components = [
  {
    id: "r1",
    name: "Main St",
    type: "road" as const,
    subtype: "road_reconstruction",
  },
  {
    id: "r2",
    name: "Oak Ave",
    type: "road" as const,
    subtype: "road_reconstruction",
  },
  { id: "b1", name: "Library", type: "building" as const, subtype: "library" },
];

describe("toFindings", () => {
  it("expands all:<type>, keeps only components with the param, coerces values", () => {
    const f = toFindings(
      [
        {
          paramId: "soilCondition",
          value: "poor",
          appliesTo: ["all:road", "b1"],
          evidence: "soft clay",
          page: 3,
        },
        {
          paramId: "rockExpected",
          value: "yes",
          appliesTo: ["r1"],
          evidence: "bedrock at 2 m",
          page: 0,
        },
      ],
      components,
    );
    expect(f[0]).toMatchObject({
      paramId: "soilCondition",
      value: "poor",
      componentIds: ["r1", "r2"],
      page: 3,
    });
    expect(f[1]).toMatchObject({ value: true, componentIds: ["r1"] });
    expect(f[1]!.page).toBeUndefined();
  });

  it("drops unknown params, invalid values and sizes", () => {
    expect(
      toFindings(
        [
          {
            paramId: "madeUp",
            value: "1",
            appliesTo: ["r1"],
            evidence: "",
            page: 1,
          },
          {
            paramId: "soilCondition",
            value: "swampy",
            appliesTo: ["r1"],
            evidence: "",
            page: 1,
          },
          {
            paramId: "gfaOverrideM2",
            value: "900",
            appliesTo: ["b1"],
            evidence: "",
            page: 1,
          },
        ],
        components,
      ),
    ).toEqual([]);
  });
});

describe("fallback", () => {
  it("finds soil and bedrock keywords in text files, for every road", () => {
    const f = keywordFindings(
      "Borehole BH1. Soft grey silty clay was found to 2.1 m. Limestone bedrock was encountered at a depth of 2.4 m.",
      components,
    );
    expect(f.map((x) => [x.paramId, x.value])).toEqual([
      ["soilCondition", "poor"],
      ["rockExpected", true],
    ]);
    expect(f[0]!.componentIds).toEqual(["r1", "r2"]);
  });

  it("returns the keyword fallback with a notice when the AI is unavailable", async () => {
    const res = await extractDocument(
      {
        fileName: "geo.txt",
        mimeType: "text/plain",
        dataBase64: Buffer.from(
          "Loose wet sand and fill near surface.",
        ).toString("base64"),
        components,
      },
      noneProvider,
    );
    expect(res.source).toBe("fallback");
    expect(res.findings[0]?.value).toBe("poor");
  });

  it("marks a busy AI", async () => {
    const busy: AIProvider = {
      ...noneProvider,
      generateStructured: () =>
        Promise.reject(new AIUnavailableError("rate_limited")),
    };
    const res = await extractDocument(
      {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        dataBase64: "JVBERi0=",
        components,
      },
      busy,
    );
    expect(res.notice).toBe("ai_busy");
    expect(res.findings).toEqual([]);
  });
});
