import type { StateCreator } from "zustand";
import type { Store } from "./store";

// Person A's slice: design state for the map and views.
// Components (geometry, add/remove/duplicate) and undo/redo arrive in P1.3,
// once the shared schemas in `src/lib/schemas` exist.

/** A selected component, or a specific section/feature inside it. */
export type SelectedElement = {
  componentId: string;
  sectionId?: string;
  featureId?: string;
};

export type ViewMode = "plan2d" | "map3d" | "site3d";
export type UnitSystem = "metric" | "imperial";

export type DesignSlice = {
  // Selection contract (TEAM.md section 3): read and set by both people.
  selectedComponentId: string | null;
  selectedElement: SelectedElement | null;
  viewMode: ViewMode;
  colourByCost: boolean;
  unitSystem: UnitSystem;

  /** Select a whole component (or clear with `null`). */
  selectComponent: (componentId: string | null) => void;
  /** Select an element; also selects its component. */
  selectElement: (element: SelectedElement | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setColourByCost: (on: boolean) => void;
  setUnitSystem: (units: UnitSystem) => void;
};

export const createDesignSlice: StateCreator<Store, [], [], DesignSlice> = (
  set,
) => ({
  selectedComponentId: null,
  selectedElement: null,
  viewMode: "plan2d",
  colourByCost: false,
  unitSystem: "metric",

  selectComponent: (componentId) =>
    set({
      selectedComponentId: componentId,
      selectedElement: componentId ? { componentId } : null,
    }),
  selectElement: (element) =>
    set({
      selectedComponentId: element?.componentId ?? null,
      selectedElement: element,
    }),
  setViewMode: (viewMode) => set({ viewMode }),
  setColourByCost: (colourByCost) => set({ colourByCost }),
  setUnitSystem: (unitSystem) => set({ unitSystem }),
});
