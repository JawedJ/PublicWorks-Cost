import { describe, expect, it } from "vitest";
import { keywordParse } from "./keyword-parse";

describe("keywordParse", () => {
  it("finds components, counts and size hints", () => {
    const r = keywordParse(
      "A two-storey 2,400 m² library, a 1.5 ha park with a splash pad, 3 townhouse blocks and a 400 m road",
    );
    expect(r.map((x) => x.subtype)).toEqual([
      "library",
      "neighbourhood_park",
      "townhouse_block",
      "townhouse_block",
      "townhouse_block",
      "road_reconstruction",
    ]);
    expect(r[0]!.params).toEqual({ gfaOverrideM2: 2400, storeys: 2 });
    expect(r[1]!.params).toEqual({ areaM2: 15000 });
    expect(r[5]!.params).toEqual({ lengthM: 400 });
  });

  it("returns nothing for unrelated text", () => {
    expect(keywordParse("hello there")).toEqual([]);
  });
});
