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

  it("puts building amenities on the building they follow", () => {
    const r = keywordParse(
      "A community centre that includes a pool and a gym, with underground parking for 40 cars, and a fire station with three bays",
    );
    expect(r.map((x) => x.subtype)).toEqual([
      "community_centre",
      "fire_station",
    ]);
    expect(r[0]!.params).toEqual({
      indoorPool: true,
      gymnasium: true,
      basement: true,
      parkingStalls: 40,
    });
    expect(r[1]!.params).toEqual({ apparatusBays: 3 });
  });

  it("doesn't give a building the amenities of a later park", () => {
    const r = keywordParse("a library, and a park with a pool");
    expect(r[0]!.params).toEqual({});
  });

  it("returns nothing for unrelated text", () => {
    expect(keywordParse("hello there")).toEqual([]);
  });
});
