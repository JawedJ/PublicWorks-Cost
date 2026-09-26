import { beforeEach, describe, expect, it } from "vitest";
import { ComponentSchema, type ComponentGeometry } from "@/lib/schemas";
import { HISTORY_LIMIT } from "./designSlice";
import { useStore } from "./store";

const initial = useStore.getState();
const s = () => useStore.getState();

const square = (lng: number, lat: number, d = 0.001) => ({
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [lng, lat],
        [lng + d, lat],
        [lng + d, lat + d],
        [lng, lat + d],
        [lng, lat],
      ] as [number, number][],
    ],
  },
});

const buildingGeometry = (): ComponentGeometry => ({
  primary: square(-79.4, 43.7),
  sections: [
    { id: "sec-a", footprint: square(-79.4, 43.7), storeys: 2, roof: "flat" },
  ],
  features: [],
});

describe("designSlice selection", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("selecting a component sets both selection fields", () => {
    s().selectComponent("road-1");
    expect(s().selectedComponentId).toBe("road-1");
    expect(s().selectedElement).toEqual({ componentId: "road-1" });
  });

  it("selecting an element also selects its component", () => {
    s().selectElement({ componentId: "lib-1", sectionId: "wing" });
    expect(s().selectedComponentId).toBe("lib-1");
    expect(s().selectedElement).toEqual({
      componentId: "lib-1",
      sectionId: "wing",
    });
  });

  it("clearing selection resets both fields", () => {
    s().selectElement({ componentId: "park-1", featureId: "f1" });
    s().selectComponent(null);
    expect(s().selectedComponentId).toBeNull();
    expect(s().selectedElement).toBeNull();
  });

  it("toggles view mode, colour by cost, and units", () => {
    s().setViewMode("map3d");
    s().setColourByCost(true);
    s().setUnitSystem("imperial");
    expect(s().viewMode).toBe("map3d");
    expect(s().colourByCost).toBe(true);
    expect(s().unitSystem).toBe("imperial");
  });
});

describe("designSlice components", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("adds planned and drawn components that pass the schema", () => {
    const planned = s().addComponent({
      type: "park",
      subtype: "neighbourhood_park",
      name: "North Park",
    });
    const drawn = s().addComponent({
      type: "building",
      subtype: "library",
      name: "Branch library",
      geometry: buildingGeometry(),
    });
    const [p, d] = s().components;
    expect(p!.id).toBe(planned);
    expect(p!.status).toBe("planned");
    expect(d!.id).toBe(drawn);
    expect(d!.status).toBe("drawn");
    for (const c of s().components) {
      expect(ComponentSchema.safeParse(c).success).toBe(true);
    }
  });

  it("drawing a planned component marks it drawn; user edits make generated components user-owned", () => {
    const id = s().addComponent({ type: "road", subtype: "r", name: "Main" });
    const line = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-79.4, 43.7],
          [-79.39, 43.7],
        ] as [number, number][],
      },
    };
    s().setComponentGeometry(id, { primary: line, features: [] }, "generated");
    expect(s().components[0]).toMatchObject({
      status: "drawn",
      origin: "generated",
    });
    s().setComponentGeometry(id, { primary: line, features: [] });
    expect(s().components[0]!.origin).toBe("user");
    s().clearComponentGeometry(id);
    expect(s().components[0]!.status).toBe("planned");
    expect(s().components[0]!.geometry).toBeUndefined();
  });

  it("renames, hides, and updates params", () => {
    const id = s().addComponent({ type: "park", subtype: "p", name: "A" });
    s().renameComponent(id, "B");
    s().setComponentVisible(id, false);
    s().updateComponent(id, { params: { lighting: true } });
    expect(s().components[0]).toMatchObject({
      name: "B",
      visible: false,
      params: { lighting: true },
    });
  });

  it("duplicates with offset geometry, new section ids, and selects the copy", () => {
    const id = s().addComponent({
      type: "building",
      subtype: "library",
      name: "Library",
      geometry: buildingGeometry(),
    });
    const copyId = s().duplicateComponent(id, "Library (copy)")!;
    const [orig, copy] = s().components;
    expect(copy!.id).toBe(copyId);
    expect(copy!.name).toBe("Library (copy)");
    expect(copy!.geometry!.sections![0]!.id).not.toBe("sec-a");
    const corner = (c: typeof orig) =>
      c!.geometry!.sections![0]!.footprint.geometry.coordinates[0]![0]!;
    const [lng0, lat0] = corner(orig);
    const [lng1, lat1] = corner(copy);
    expect(lng1).toBeGreaterThan(lng0);
    // 25 m south
    expect((lat0 - lat1) * 111_320).toBeCloseTo(25, 5);
    expect(s().selectedComponentId).toBe(copyId);
    // Original untouched
    expect(orig!.geometry!.sections![0]!.id).toBe("sec-a");
  });

  it("removing the selected component clears the selection", () => {
    const id = s().addComponent({ type: "park", subtype: "p", name: "A" });
    s().selectComponent(id);
    s().removeComponent(id);
    expect(s().components).toHaveLength(0);
    expect(s().selectedComponentId).toBeNull();
  });
});

describe("designSlice undo/redo", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("undoes and redoes component changes", () => {
    const id = s().addComponent({ type: "park", subtype: "p", name: "A" });
    s().renameComponent(id, "B");
    s().undo();
    expect(s().components[0]!.name).toBe("A");
    s().undo();
    expect(s().components).toHaveLength(0);
    s().undo(); // no-op on empty history
    s().redo();
    s().redo();
    expect(s().components[0]!.name).toBe("B");
  });

  it("a new change clears the redo stack", () => {
    const id = s().addComponent({ type: "park", subtype: "p", name: "A" });
    s().renameComponent(id, "B");
    s().undo();
    s().renameComponent(id, "C");
    s().redo();
    expect(s().components[0]!.name).toBe("C");
    expect(s().future).toHaveLength(0);
  });

  it("adding several components is one undo step", () => {
    s().addComponents([
      { type: "road", subtype: "r", name: "Road" },
      { type: "park", subtype: "p", name: "Park" },
    ]);
    expect(s().components).toHaveLength(2);
    s().undo();
    expect(s().components).toHaveLength(0);
  });

  it("undoing a component's creation clears its selection; undoing a section drop keeps the component selected", () => {
    const id = s().addComponent({
      type: "building",
      subtype: "library",
      name: "L",
      geometry: buildingGeometry(),
    });
    s().selectElement({ componentId: id, sectionId: "sec-a" });
    s().setComponentGeometry(id, {
      ...buildingGeometry(),
      sections: [{ ...buildingGeometry().sections![0]!, id: "sec-b" }],
    });
    expect(s().selectedElement).toEqual({ componentId: id });
    s().undo();
    s().undo();
    expect(s().selectedComponentId).toBeNull();
  });

  it("undoes the project area and caps history", () => {
    s().setAreaBoundary(square(-79.4, 43.7));
    s().undo();
    expect(s().areaBoundary).toBeNull();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      s().addComponent({ type: "park", subtype: "p", name: `P${i}` });
    }
    expect(s().past).toHaveLength(HISTORY_LIMIT);
  });

  it("loading a design clears history and selection", () => {
    const id = s().addComponent({ type: "park", subtype: "p", name: "A" });
    s().selectComponent(id);
    s().loadDesign({ components: [], areaBoundary: null });
    expect(s().past).toHaveLength(0);
    expect(s().selectedComponentId).toBeNull();
    s().undo();
    expect(s().components).toHaveLength(0);
  });
});
