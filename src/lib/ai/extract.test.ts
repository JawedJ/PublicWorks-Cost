import { describe, expect, it } from "vitest";
import { extractDocument, keywordFindings, toFindings } from "./extract";
import { AIUnavailableError, type AIProvider, noneProvider } from "./provider";

const components = [
  {
    id: "r1",
    name: "Main St",
    type: "road" as const,
    subtype: "road_reconstruction",
    resizable: false,
  },
  {
    id: "r2",
    name: "Oak Ave",
    type: "road" as const,
    subtype: "road_reconstruction",
    resizable: false,
  },
  {
    id: "b1",
    name: "Library",
    type: "building" as const,
    subtype: "library",
    resizable: true,
  },
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

  it("takes site reviews, and sizes only for components the layout placed", () => {
    const f = toFindings(
      [
        {
          paramId: "schoolReview",
          value: "no_measures",
          appliesTo: ["all:road"],
          evidence: "no concern",
          page: 1,
        },
        {
          paramId: "gfaOverrideM2",
          value: "2400",
          appliesTo: ["b1"],
          evidence: "2,400 m²",
          page: 2,
        },
        {
          paramId: "storeys",
          value: "3",
          appliesTo: ["b1"],
          evidence: "three storeys",
          page: 2,
        },
        {
          paramId: "lengthM",
          value: "900",
          appliesTo: ["r1"],
          evidence: "900 m",
          page: 2,
        },
      ],
      components,
    );
    expect(f.map((x) => [x.paramId, x.value, x.componentIds])).toEqual([
      ["schoolReview", "no_measures", ["r1", "r2"]],
      ["gfaOverrideM2", 2400, ["b1"]],
      ["storeys", 3, ["b1"]],
    ]);
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
            // r1 was drawn by the user: its size comes from the drawing.
            paramId: "lengthM",
            value: "900",
            appliesTo: ["r1"],
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
