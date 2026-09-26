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

describe("designSlice drawing", () => {
  beforeEach(() => useStore.setState(initial, true));

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
  const pin = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Point" as const,
      coordinates: [-79.4, 43.7] as [number, number],
    },
  };

  it("refuses a tool the target can't use", () => {
    s().startDrawing({
      target: { kind: "new", type: "road", subtype: "r", name: "Road 1" },
      tool: "polygon",
    });
    expect(s().drawing).toBeNull();
  });

  it("a drawn road becomes a selected, drawn component in one undo step", () => {
    s().startDrawing({
      target: {
        kind: "new",
        type: "road",
        subtype: "road_reconstruction",
        name: "Road 1",
      },
      tool: "line",
    });
    const id = s().finishDrawing(line)!;
    const c = s().components[0]!;
    expect(c).toMatchObject({
      id,
      name: "Road 1",
      status: "drawn",
      origin: "user",
    });
    expect(c.geometry!.primary).toEqual(line);
    expect(s().selectedComponentId).toBe(id);
    expect(s().drawing).toBeNull();
    expect(ComponentSchema.safeParse(c).success).toBe(true);
    s().undo();
    expect(s().components).toHaveLength(0);
  });

  it("a drawn building gets a first section from its shape", () => {
    s().startDrawing({
      target: {
        kind: "new",
        type: "building",
        subtype: "library",
        name: "Library",
      },
      tool: "rectangle",
    });
    s().finishDrawing(square(-79.4, 43.7));
    const g = s().components[0]!.geometry!;
    expect(g.sections).toHaveLength(1);
    expect(g.sections![0]!.footprint).toEqual(g.primary);
    expect(ComponentSchema.safeParse(s().components[0]).success).toBe(true);

    // A second section
    s().startDrawing({
      target: { kind: "section", componentId: s().components[0]!.id },
      tool: "polygon",
    });
    s().finishDrawing(square(-79.399, 43.7));
    expect(s().components[0]!.geometry!.sections).toHaveLength(2);
  });

  it("fulfils a planned component and places features", () => {
    const id = s().addComponent({ type: "park", subtype: "p", name: "Park" });
    s().startDrawing({
      target: { kind: "planned", componentId: id },
      tool: "freehand",
    });
    s().finishDrawing(square(-79.4, 43.7, 0.01));
    expect(s().components[0]!.status).toBe("drawn");

    s().startDrawing({
      target: { kind: "feature", componentId: id, featureKind: "playground" },
      tool: "point",
    });
    s().finishDrawing(pin);
    expect(s().components[0]!.geometry!.features[0]).toMatchObject({
      kind: "playground",
      geometry: pin,
    });
  });

  it("draws the project area, and ignores a shape of the wrong type", () => {
    s().startDrawing({ target: { kind: "area" }, tool: "circle" });
    expect(s().finishDrawing(line)).toBeNull();
    expect(s().areaBoundary).toBeNull();
    s().startDrawing({ target: { kind: "area" }, tool: "circle" });
    s().finishDrawing(square(-79.4, 43.7));
    expect(s().areaBoundary).toEqual(square(-79.4, 43.7));
    s().undo();
    expect(s().areaBoundary).toBeNull();
  });
});

describe("designSlice editing", () => {
  beforeEach(() => useStore.setState(initial, true));

  const addBuilding = () =>
    s().addComponent({
      type: "building",
      subtype: "library",
      name: "Library",
      geometry: buildingGeometry(),
      origin: "generated",
    });

  it("a live drag previews without history and commits as one undo step", () => {
    const id = addBuilding();
    const before = s().components[0]!.geometry!;
    const moved = { ...before, primary: square(-79.3, 43.7) };
    const pastLength = s().past.length;
    s().previewComponentGeometry(id, moved);
    s().previewComponentGeometry(id, moved);
    expect(s().past).toHaveLength(pastLength);
    s().endGeometryPreview(id, before, moved);
    expect(s().past).toHaveLength(pastLength + 1);
    expect(s().components[0]!.origin).toBe("user");
    s().undo();
    expect(s().components[0]!.geometry).toEqual(before);
  });

  it("reshaping the linked first section keeps the site in step", () => {
    const id = addBuilding();
    s().editElement(
      id,
      { role: "section", id: "sec-a" },
      square(-79.4, 43.7, 0.002),
    );
    const g = s().components[0]!.geometry!;
    expect(g.sections![0]!.footprint.geometry).toEqual(
      square(-79.4, 43.7, 0.002).geometry,
    );
    expect(g.primary.geometry).toEqual(g.sections![0]!.footprint.geometry);
  });

  it("mirrors a component about its centre, and undoes it", () => {
    const id = addBuilding();
    const before = s().components[0]!.geometry!;
    s().mirrorComponent(id, "vertical");
    const ring =
      s().components[0]!.geometry!.sections![0]!.footprint.geometry
        .coordinates[0]!;
    const lngs = ring.map((p) => p[0]);
    expect(Math.min(...lngs)).toBeCloseTo(-79.4, 9);
    expect(Math.max(...lngs)).toBeCloseTo(-79.399, 9);
    s().undo();
    expect(s().components[0]!.geometry).toEqual(before);
  });

  it("removes a section but keeps the last one", () => {
    const id = addBuilding();
    s().startDrawing({
      target: { kind: "section", componentId: id },
      tool: "rectangle",
    });
    s().finishDrawing(square(-79.39, 43.7));
    const [, second] = s().components[0]!.geometry!.sections!;
    s().removeElement(id, { role: "section", id: second!.id });
    expect(s().components[0]!.geometry!.sections).toHaveLength(1);
    s().removeElement(id, { role: "section", id: "sec-a" });
    expect(s().components[0]!.geometry!.sections).toHaveLength(1);
  });

  it("cuts a courtyard, and reports a hole drawn outside the shape", () => {
    const id = addBuilding();
    s().startDrawing({
      target: { kind: "hole", componentId: id },
      tool: "rectangle",
    });
    expect(s().finishDrawing(square(-79.3996, 43.7004, 0.0002))).toBe(id);
    expect(
      s().components[0]!.geometry!.sections![0]!.footprint.geometry.coordinates,
    ).toHaveLength(2);

    s().startDrawing({
      target: { kind: "hole", componentId: id },
      tool: "rectangle",
    });
    expect(s().finishDrawing(square(-79.5, 43.7))).toBeNull();
    expect(s().drawNotice).toBe("holeOutside");
    expect(s().drawing).toBeNull();
    s().startDrawing({
      target: { kind: "hole", componentId: id },
      tool: "polygon",
    });
    expect(s().drawNotice).toBeNull();
  });
});
