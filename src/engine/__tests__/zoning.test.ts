import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { computeEstimate } from "@/engine";
import { measureProject } from "@/lib/geo/measure";
import { northgateProject as p } from "@/lib/fixtures";
import type { ZoningContext } from "@/lib/schemas";
import { zoningFlags } from "../zoning";

const library = p.components.find(
  (c) => c.name === "Northgate Branch Library",
)!;
const fire = p.components.find((c) => c.name === "Fire Station 7")!;
const ctx = (zones: ZoningContext["zones"]): ZoningContext => ({
  fetchedAt: "2026-09-26T00:00:00.000Z",
  zones,
});

describe("zoning flags (SPEC 8.3 MVP)", () => {
  it("names the zone and by-law, with the link", () => {
    const f = zoningFlags(
      [library],
      ctx({
        [library.id]: {
          status: "ok",
          city: "Ottawa",
          bylaw: "2008-250",
          code: "MD S35",
          name: "Mixed Use - Commercial Zones II",
          link: "https://documents.ottawa.ca/x.pdf",
        },
      }),
    );
    expect(f.map((x) => x.code)).toEqual(["zoning_zone"]);
    expect(f[0]!.title.en).toBe("Zoned MD S35");
    expect(f[0]!.explanation.en).toContain("Ottawa Zoning By-law 2008-250");
    expect(f[0]!.explanation.en).toContain("https://documents.ottawa.ca/x.pdf");
    expect(f[0]!.severity).toBe("info");
  });

  it("warns on a likely use mismatch and on site-specific zones", () => {
    const f = zoningFlags(
      [fire],
      ctx({
        [fire.id]: {
          status: "ok",
          city: "Cambridge",
          bylaw: "150-85",
          code: "R4",
          name: "Low density residential",
          siteSpecific: "S.4.2.8.2",
        },
      }),
    );
    expect(f.map((x) => x.code)).toEqual(["zoning_zone", "zoning_use"]);
    expect(f[0]!.severity).toBe("warning");
    expect(f[0]!.explanation.en).toContain("S.4.2.8.2");
  });

  it("one project flag when zoning can't be checked; nothing before lookup", () => {
    const f = zoningFlags(
      [library, fire],
      ctx({
        [library.id]: { status: "no_data" },
        [fire.id]: { status: "no_data" },
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("zoning_not_checked");
    expect(f[0]!.componentIds).toEqual([library.id, fire.id]);
    expect(zoningFlags([library], undefined)).toEqual([]);
    expect(zoningFlags([library], ctx({}))).toEqual([]);
  });

  it("the engine adds them without changing any cost", () => {
    const base = computeEstimate(p, measureProject(p), refData, { seed: 1 });
    const zoned = {
      ...p,
      zoningContext: ctx({ [library.id]: { status: "no_data" } }),
    };
    const e = computeEstimate(zoned, measureProject(zoned), refData, {
      seed: 1,
    });
    expect(e.flags.some((f) => f.code === "zoning_not_checked")).toBe(true);
    expect(e.distribution.p50).toBe(base.distribution.p50);
  });
});
