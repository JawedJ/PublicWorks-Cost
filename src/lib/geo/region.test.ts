import { describe, expect, it } from "vitest";
import regional from "@/data/regional-factors.json";
import { regionForPlace } from "./region";

describe("regionForPlace", () => {
  it("maps Ontario municipalities to their pricing region", () => {
    expect(regionForPlace("Hamilton, Ontario, Canada")).toBe("hamilton");
    expect(regionForPlace("Kitchener")).toBe("waterloo_region");
    expect(regionForPlace("Mississauga, Ontario")).toBe("peel_york_halton");
    expect(regionForPlace("City of Thunder Bay")).toBe("thunder_bay");
    expect(regionForPlace("Sault Ste. Marie, ON")).toBe("sault_ste_marie");
    expect(regionForPlace("Middlesex Centre")).toBe("london_middlesex");
  });

  it("uses the first place named", () => {
    expect(regionForPlace("Waterloo, Ontario, Canada")).toBe("waterloo_region");
  });

  it("returns undefined for unknown or out-of-province places", () => {
    expect(regionForPlace("Guelph")).toBeUndefined();
    expect(regionForPlace("Windsor, Nova Scotia, Canada")).toBeUndefined();
    expect(regionForPlace("")).toBeUndefined();
  });

  it("only returns keys that exist in regional-factors.json", () => {
    const keys = new Set(regional.regions.map((r) => r.key));
    for (const place of [
      "Toronto",
      "Oshawa",
      "Ottawa",
      "Barrie",
      "Welland",
      "Windsor",
      "Kingston",
      "Sudbury",
      "North Bay",
      "Timmins",
      "Kenora",
    ])
      expect(keys.has(regionForPlace(place)!)).toBe(true);
  });
});
