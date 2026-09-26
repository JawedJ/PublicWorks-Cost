import { describe, expect, it } from "vitest";
import { northgateProject } from "@/lib/fixtures";
import { buildPlan, roadProfile } from "./plan";

describe("plan rendering", () => {
  it("is deterministic and covers every layer kind for the sample", () => {
    const a = buildPlan(northgateProject.components);
    const b = buildPlan(northgateProject.components);
    expect(a).toEqual(b);
    const layers = new Set(a.map((f) => f.properties.layer));
    for (const l of [
      "road-asphalt",
      "road-base",
      "roof",
      "storeys",
      "grass",
      "tree",
    ])
      expect(layers).toContain(l);
  });

  it("derives road width from lanes and sidewalks", () => {
    const road = northgateProject.components.find((c) => c.type === "road")!;
    const r = roadProfile({
      ...road,
      params: {
        lanes: 4,
        laneWidthM: 3.5,
        sidewalkSides: 2,
        sidewalkWidthM: 2,
        parkingLanes: 0,
        cycling: "none",
      },
    });
    expect(r.carriagewayM).toBe(14);
    expect(r.totalM).toBe(20);
  });
});
