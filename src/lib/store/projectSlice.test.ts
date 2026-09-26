import { beforeEach, describe, expect, it } from "vitest";
import { northgateProject } from "@/lib/fixtures";
import { ProjectSchema } from "@/lib/schemas";
import { BASELINE_SCENARIO_ID, selectProject } from "./projectSlice";
import { useStore } from "./store";

const initial = useStore.getState();
const s = () => useStore.getState();

const addRoad = () =>
  s().addComponent({ type: "road", subtype: "new_local_road", name: "Road" });

describe("projectSlice", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("starts with a valid empty project once named", () => {
    s().newProject({ name: "Test" });
    const p = selectProject(s());
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    expect(p.components).toEqual([]);
    expect(p.activeScenarioId).toBe(BASELINE_SCENARIO_ID);
    expect(p.areaBoundary).toBeUndefined();
  });

  it("newProject clears the design and history", () => {
    addRoad();
    s().newProject({ name: "Fresh", municipality: "Ottawa" });
    expect(s().components).toEqual([]);
    expect(s().past).toEqual([]);
    expect(s().project.municipality).toBe("Ottawa");
  });

  it("round-trips a full project through loadProject and selectProject", () => {
    s().loadProject(structuredClone(northgateProject));
    expect(selectProject(s())).toEqual(northgateProject);
    expect(s().past).toEqual([]);
  });

  it("updates info and settings and bumps updatedAt", () => {
    s().loadProject(structuredClone(northgateProject));
    s().updateProjectInfo({ name: "Renamed" });
    s().updateSettings({ durationMonths: 24 });
    expect(s().project.name).toBe("Renamed");
    expect(s().project.settings.durationMonths).toBe(24);
    expect(s().project.settings.startDate).toBe(
      northgateProject.settings.startDate,
    );
    expect(s().project.updatedAt).not.toBe(northgateProject.updatedAt);
  });

  it("only activates scenarios that exist", () => {
    s().loadProject(structuredClone(northgateProject));
    s().setActiveScenario("missing");
    expect(s().project.activeScenarioId).toBe("baseline");
    s().setActiveScenario("scn-fire-later");
    expect(s().project.activeScenarioId).toBe("scn-fire-later");
  });
});

describe("projectSlice params and overrides", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("sets a param with its source, as one undoable step", () => {
    const id = addRoad();
    s().setComponentParam(id, "lanes", 2);
    s().setComponentParam(id, "soilCondition", "poor", "ai_document", "p. 4");
    const c = s().components[0]!;
    expect(c.params).toEqual({ lanes: 2, soilCondition: "poor" });
    expect(c.paramMeta).toEqual({
      lanes: { source: "user" },
      soilCondition: { source: "ai_document", evidence: "p. 4" },
    });
    s().undo();
    expect(s().components[0]!.params).toEqual({ lanes: 2 });
  });

  it("clears a param and its meta", () => {
    const id = addRoad();
    s().setComponentParam(id, "lanes", 2);
    s().clearComponentParam(id, "lanes");
    expect(s().components[0]!.params).toEqual({});
    expect(s().components[0]!.paramMeta).toEqual({});
  });

  it("sets, resets, and clears overrides", () => {
    const id = addRoad();
    s().setOverride(id, "unitPrices", "asphalt-hl3", 120);
    s().setOverride(id, "quantities", "asphalt-hl3", 50);
    expect(s().components[0]!.overrides).toEqual({
      quantities: { "asphalt-hl3": 50 },
      unitPrices: { "asphalt-hl3": 120 },
    });
    s().setOverride(id, "unitPrices", "asphalt-hl3", null);
    expect(s().components[0]!.overrides.unitPrices).toEqual({});
    s().resetOverrides(id);
    expect(s().components[0]!.overrides.quantities).toEqual({});
  });

  it("ignores unknown components", () => {
    const before = s().past.length;
    s().setComponentParam("nope", "lanes", 2);
    s().setOverride("nope", "quantities", "x", 1);
    expect(s().past.length).toBe(before);
  });
});

describe("site context auto-fill (P6.3)", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("fills default road params from the street it follows, not user values", () => {
    s().loadProject(northgateProject);
    const road = s().components.find((c) => c.name === "Library Lane")!;
    const g = road.geometry!.primary.geometry;
    const [lng, lat] = (g.type === "LineString" ? g.coordinates[0] : [0, 0])!;
    s().setComponentParam(road.id, "sidewalkSides", 2); // the user's answer
    s().setSiteContext({
      source: "overpass",
      fetchedAt: "2026-09-26T00:00:00.000Z",
      features: [
        {
          id: "w1",
          kind: "road",
          name: "Weber Street",
          tags: { highway: "residential", lanes: "3", sidewalk: "no" },
          geometry: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [lng!, lat!],
                [lng! + 0.001, lat!],
              ],
            },
          },
        },
      ],
    });
    const after = s().components.find((c) => c.id === road.id)!;
    expect(after.params.lanes).toBe(3);
    expect(after.paramMeta.lanes).toEqual({
      source: "site_context",
      evidence: "OpenStreetMap: lanes=3 on Weber Street",
    });
    expect(after.params.sidewalkSides).toBe(2);
    expect(after.paramMeta.sidewalkSides?.source).toBe("user");
  });
});
