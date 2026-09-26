import { describe, expect, it } from "vitest";
import { capitalizeName } from "./build-list";

describe("capitalizeName", () => {
  it("capitalizes each word, keeps small words and existing capitals", () => {
    expect(capitalizeName("main street watermain")).toBe(
      "Main Street Watermain",
    );
    expect(capitalizeName("the park of the north end")).toBe(
      "The Park of the North End",
    );
    expect(capitalizeName("HL3 resurfacing on McRae ave")).toBe(
      "HL3 Resurfacing on McRae Ave",
    );
    expect(capitalizeName("north-end library")).toBe("North-End Library");
  });
});
