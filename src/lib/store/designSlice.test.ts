import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

const initial = useStore.getState();

describe("designSlice selection", () => {
  beforeEach(() => useStore.setState(initial, true));

  it("selecting a component sets both selection fields", () => {
    useStore.getState().selectComponent("road-1");
    const s = useStore.getState();
    expect(s.selectedComponentId).toBe("road-1");
    expect(s.selectedElement).toEqual({ componentId: "road-1" });
  });

  it("selecting an element also selects its component", () => {
    useStore
      .getState()
      .selectElement({ componentId: "lib-1", sectionId: "wing" });
    const s = useStore.getState();
    expect(s.selectedComponentId).toBe("lib-1");
    expect(s.selectedElement).toEqual({
      componentId: "lib-1",
      sectionId: "wing",
    });
  });

  it("clearing selection resets both fields", () => {
    useStore
      .getState()
      .selectElement({ componentId: "park-1", featureId: "f1" });
    useStore.getState().selectComponent(null);
    const s = useStore.getState();
    expect(s.selectedComponentId).toBeNull();
    expect(s.selectedElement).toBeNull();
  });

  it("toggles view mode, colour by cost, and units", () => {
    const s = useStore.getState();
    s.setViewMode("map3d");
    s.setColourByCost(true);
    s.setUnitSystem("imperial");
    const after = useStore.getState();
    expect(after.viewMode).toBe("map3d");
    expect(after.colourByCost).toBe(true);
    expect(after.unitSystem).toBe("imperial");
  });
});
