import { describe, expect, it } from "vitest";
import { directionView, findMunicipality, findSite, siteQuery } from "./place";

const demo =
  "A new community hub in north Waterloo near Laurel Creek, starting spring 2027: reconstruct the local street with a new watermain";

describe("place from a description", () => {
  it("finds the municipality and the site within it", () => {
    expect(findMunicipality(demo)).toBe("Waterloo");
    expect(findSite(demo, "Waterloo")).toBe("north near Laurel Creek");
    expect(
      findSite("A library at King and University in Waterloo", "Waterloo"),
    ).toBe("at King and University");
    expect(
      findSite("A library and a park in Waterloo", "Waterloo"),
    ).toBeUndefined();
  });

  it("turns a site into a search and a part of town", () => {
    expect(siteQuery("north near Laurel Creek")).toBe("Laurel Creek");
    expect(siteQuery("north Waterloo near Laurel Creek", "Waterloo")).toBe(
      "Laurel Creek",
    );
    expect(siteQuery("north end of Waterloo", "Waterloo")).toBe("");
    expect(siteQuery("at King & University")).toBe("King and University");
    const v = directionView(
      {
        id: "c",
        label: "Waterloo",
        center: [-80.52, 43.47],
        bbox: [-80.62, 43.42, -80.47, 43.53],
      },
      "north",
    )!;
    expect(v.lat).toBeCloseTo(43.5, 2);
    expect(v.lng).toBeCloseTo(-80.52, 2);
  });
});
