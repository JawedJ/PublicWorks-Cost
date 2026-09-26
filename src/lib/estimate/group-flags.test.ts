import { describe, expect, it } from "vitest";
import type { Flag } from "@/lib/schemas";
import { groupFlags } from "./group-flags";

const flag = (
  id: string,
  code: string,
  explanation: string,
  componentIds: string[],
  severity: Flag["severity"] = "warning",
): Flag => ({
  id,
  code,
  severity,
  title: { en: code, fr: code },
  explanation: { en: explanation, fr: explanation },
  componentIds,
});

describe("groupFlags", () => {
  it("merges the same issue on several components, keeping what differs per component", () => {
    const [school] = groupFlags([
      flag(
        "a",
        "school",
        "Work near a school needs traffic control. 63 m from Northgate PS.",
        ["h1"],
      ),
      flag(
        "b",
        "school",
        "Work near a school needs traffic control. 80 m from Northgate PS.",
        ["h2"],
      ),
    ]);
    expect(school!.explanation).toBe(
      "Work near a school needs traffic control.",
    );
    expect(school!.items).toEqual([
      { componentIds: ["h1"], detail: "63 m from Northgate PS." },
      { componentIds: ["h2"], detail: "80 m from Northgate PS." },
    ]);
  });

  it("keeps identical text whole and different issues apart, most severe first", () => {
    const groups = groupFlags([
      flag("a", "winter", "Winter premium.", ["r1"], "info"),
      flag("b", "winter", "Winter premium.", ["r2"], "info"),
      flag("c", "creek", "Permit likely.", ["r1"], "high"),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["creek", "winter"]);
    expect(groups[1]!.explanation).toBe("Winter premium.");
    expect(groups[1]!.items.every((i) => !i.detail)).toBe(true);
  });
});
