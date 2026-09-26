import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { customBases, customLine, suggestBasis } from "../templates/custom";
import { structureTemplate } from "../templates/structure";
import { byId, makeCtx } from "./helpers";

describe("structure template (SPEC 6.4)", () => {
  it("prices a culvert by span and length, with in-water work for fish habitat", () => {
    const ctx = makeCtx(
      structureTemplate,
      "culvert_replacement",
      {},
      { spanM: 3, lengthM: 24, fishHabitat: true },
    );
    const q = byId(structureTemplate.deriveQuantities(ctx));
    expect(q.culvert!.quantity).toBe(24);
    expect(q.in_water).toBeDefined();
    expect(structureTemplate.flags(ctx).map((f) => f.code)).toEqual([
      "in_water_permit",
    ]);
  });

  it("uses a drawn bridge line as the deck length", () => {
    const ctx = makeCtx(
      structureTemplate,
      "small_bridge",
      { lengthM: 30 },
      { deckWidthM: 12 },
    );
    expect(byId(structureTemplate.deriveQuantities(ctx)).deck!.quantity).toBe(
      360,
    );
  });
});

describe("custom elements (SPEC 6.5)", () => {
  it("prices an own rate with the default wide band", () => {
    const line = customLine(
      "x",
      "Skate plaza",
      { mode: "own_rate", unit: "m2", rate: 500 },
      { areaM2: 100 },
      refData,
    )!;
    expect(line.quantity).toBe(100);
    if (line.price.kind !== "direct") throw new Error();
    expect(line.price.price).toEqual({ low: 350, typical: 500, high: 800 });
    expect(line.price.lowConfidence).toBe(true);
  });

  it("prices a matched basis from seed data", () => {
    const line = customLine(
      "x",
      "Boardwalk",
      {
        mode: "matched",
        basisId: "boardwalk_timber",
        unit: "m2",
        suggestedByAi: false,
      },
      { areaM2: 50 },
      refData,
    )!;
    if (line.price.kind !== "direct") throw new Error();
    expect(line.price.price.typical).toBe(1100);
  });
});

describe("custom element matching", () => {
  const bases = customBases(refData);

  it("prices a custom element matched to a real building rate", () => {
    const line = customLine(
      "custom",
      "Community pool",
      {
        mode: "matched",
        basisId: "building:aquatic_centre",
        unit: "m2",
        suggestedByAi: false,
      },
      { areaM2: 2000 },
      refData,
    );
    const rate = refData.buildingCosts.subtypes.aquatic_centre!.perM2.typical;
    expect(line!.quantity).toBe(2000);
    expect(line!.price.kind === "direct" && line!.price.price.typical).toBe(
      rate,
    );
    expect(line!.price.kind === "direct" && line!.price.source.en).toContain(
      "Altus Group 2026",
    );
  });

  it("suggests a basis from the name", () => {
    const pick = (name: string) => suggestBasis(name, bases)?.id;
    expect(pick("Community pool")).toBe("building:aquatic_centre");
    expect(pick("Hockey arena")).toBe("building:ice_arena");
    expect(pick("Municipal works yard")).toBe("building:maintenance_facility");
    expect(pick("Skate park")).toBe("skate_park");
    expect(pick("Xyzzy")).toBeUndefined();
  });

  it("only offers units a custom element can use", () => {
    expect(bases.every((b) => ["m", "m2", "each"].includes(b.unit))).toBe(true);
    expect(new Set(bases.map((b) => b.id)).size).toBe(bases.length);
  });
});
