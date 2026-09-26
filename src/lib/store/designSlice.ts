import type { StateCreator } from "zustand";
import type {
  AnyFeature,
  Component,
  ComponentGeometry,
  ComponentType,
  PolygonFeature,
} from "@/lib/schemas";
import {
  geometryForType,
  geometryTypeOf,
  newId,
  toolsForTarget,
  withFeature,
  withSection,
  type Drawing,
} from "@/lib/geo/drawing";
import { translateFeature } from "@/lib/geo/transform";
import type { Store } from "./store";

// Person A's slice: the project's components (geometry, add/remove/duplicate),
// the optional project area, selection, undo/redo, and view settings.
// Person B's projectSlice edits params/paramMeta/overrides through
// `updateComponent`, so those edits share the same undo history.

/** A selected component, or a specific section/feature inside it. */
export type SelectedElement = {
  componentId: string;
  sectionId?: string;
  featureId?: string;
};

export type ViewMode = "plan2d" | "map3d" | "site3d";
export type UnitSystem = "metric" | "imperial";

/** The part of the state that undo/redo restores. */
export type DesignSnapshot = {
  components: Component[];
  areaBoundary: PolygonFeature | null;
};

export type NewComponentInput = {
  type: ComponentType;
  subtype: string;
  name: string;
  geometry?: ComponentGeometry;
  origin?: Component["origin"];
  id?: string;
} & Partial<
  Pick<
    Component,
    "params" | "paramMeta" | "customPricing" | "startOffsetMonths" | "visible"
  >
>;

/** Distance a duplicate is shifted east and south, so it doesn't sit on top of the original. */
export const DUPLICATE_OFFSET_M = 25;
export const HISTORY_LIMIT = 100;

export type DesignSlice = DesignSnapshot & {
  // Selection contract (TEAM.md section 3): read and set by both people.
  selectedComponentId: string | null;
  selectedElement: SelectedElement | null;
  viewMode: ViewMode;
  colourByCost: boolean;
  unitSystem: UnitSystem;
  /** Undo/redo stacks; most recent last. */
  past: DesignSnapshot[];
  future: DesignSnapshot[];
  /** The shape being drawn on the map, or `null` when not drawing. */
  drawing: Drawing | null;

  /** Select a whole component (or clear with `null`). */
  selectComponent: (componentId: string | null) => void;
  /** Select an element; also selects its component. */
  selectElement: (element: SelectedElement | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setColourByCost: (on: boolean) => void;
  setUnitSystem: (units: UnitSystem) => void;

  /** Adds a component; it is 'drawn' if it has geometry, otherwise 'planned'. Returns its id. */
  addComponent: (input: NewComponentInput) => string;
  /** Adds several components as one undo step (e.g. a build list or generated layout). Returns their ids. */
  addComponents: (inputs: NewComponentInput[]) => string[];
  /** Applies a patch to one component. `id`, `type` and `status` can't be changed this way. */
  updateComponent: (
    id: string,
    patch: Partial<Omit<Component, "id" | "type" | "status">>,
  ) => void;
  /**
   * Sets a component's geometry and marks it drawn. Edits by the user (the default)
   * turn a generated component into a user one; the layout generator passes 'generated'.
   */
  setComponentGeometry: (
    id: string,
    geometry: ComponentGeometry,
    origin?: Component["origin"],
  ) => void;
  /** Removes geometry, returning the component to 'planned'. */
  clearComponentGeometry: (id: string) => void;
  renameComponent: (id: string, name: string) => void;
  setComponentVisible: (id: string, visible: boolean) => void;
  /** Copies a component (geometry offset, new ids for sections and features) and selects it. Returns the new id. */
  duplicateComponent: (id: string, name?: string) => string | null;
  removeComponent: (id: string) => void;
  setAreaBoundary: (boundary: PolygonFeature | null) => void;
  /** Replaces all components and the area (e.g. opening a project file). Clears history and selection. */
  loadDesign: (snapshot: DesignSnapshot) => void;

  /** Starts drawing, if the tool suits the target. */
  startDrawing: (drawing: Drawing) => void;
  cancelDrawing: () => void;
  /**
   * Applies a finished shape to the current drawing target (one undo step), selects
   * the component, and stops drawing. Returns the component id, or `null` if the
   * shape doesn't fit the target.
   */
  finishDrawing: (shape: AnyFeature) => string | null;

  undo: () => void;
  redo: () => void;
};

export { newId };

export function createComponent(input: NewComponentInput): Component {
  return {
    id: input.id ?? newId(),
    name: input.name,
    type: input.type,
    subtype: input.subtype,
    status: input.geometry ? "drawn" : "planned",
    origin: input.origin ?? "user",
    geometry: input.geometry,
    params: input.params ?? {},
    paramMeta: input.paramMeta ?? {},
    overrides: { quantities: {}, unitPrices: {} },
    customPricing: input.customPricing,
    startOffsetMonths: input.startOffsetMonths,
    visible: input.visible ?? true,
  };
}

/** Copy of a geometry moved by (eastM, northM), with fresh section and feature ids. */
function offsetGeometry(
  g: ComponentGeometry,
  eastM: number,
  northM: number,
): ComponentGeometry {
  return {
    primary: translateFeature(g.primary, eastM, northM),
    sections: g.sections?.map((s) => ({
      ...s,
      id: newId(),
      footprint: translateFeature(s.footprint, eastM, northM),
    })),
    features: g.features.map((f) => ({
      ...f,
      id: newId(),
      geometry: translateFeature(f.geometry, eastM, northM),
    })),
  };
}

export const createDesignSlice: StateCreator<Store, [], [], DesignSlice> = (
  set,
  get,
) => {
  const snapshot = (): DesignSnapshot => ({
    components: get().components,
    areaBoundary: get().areaBoundary,
  });

  /** Keeps the selection pointing at something that exists. */
  const fixSelection = () => {
    const { components, selectedComponentId, selectedElement } = get();
    if (!selectedComponentId) return;
    const c = components.find((x) => x.id === selectedComponentId);
    if (!c) return set({ selectedComponentId: null, selectedElement: null });
    const { sectionId, featureId } = selectedElement ?? {};
    const missing =
      (sectionId && !c.geometry?.sections?.some((s) => s.id === sectionId)) ||
      (featureId && !c.geometry?.features.some((f) => f.id === featureId));
    if (missing) set({ selectedElement: { componentId: c.id } });
  };

  /** Applies a design change as one undo step. State is replaced immutably, so snapshots are cheap. */
  const commit = (next: Partial<DesignSnapshot>) => {
    set((s) => ({
      ...next,
      past: [...s.past, snapshot()].slice(-HISTORY_LIMIT),
      future: [],
    }));
    fixSelection();
  };

  const mapComponent = (id: string, fn: (c: Component) => Component) => {
    if (!get().components.some((c) => c.id === id)) return;
    commit({
      components: get().components.map((c) => (c.id === id ? fn(c) : c)),
    });
  };

  return {
    components: [],
    areaBoundary: null,
    selectedComponentId: null,
    selectedElement: null,
    viewMode: "plan2d",
    colourByCost: false,
    unitSystem: "metric",
    past: [],
    future: [],
    drawing: null,

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

    addComponent: (input) => get().addComponents([input])[0]!,
    addComponents: (inputs) => {
      const created = inputs.map(createComponent);
      commit({ components: [...get().components, ...created] });
      return created.map((c) => c.id);
    },
    updateComponent: (id, patch) =>
      mapComponent(id, (c) => ({ ...c, ...patch })),
    setComponentGeometry: (id, geometry, origin = "user") =>
      mapComponent(id, (c) => ({ ...c, geometry, status: "drawn", origin })),
    clearComponentGeometry: (id) =>
      mapComponent(id, (c) => ({
        ...c,
        geometry: undefined,
        status: "planned",
      })),
    renameComponent: (id, name) => mapComponent(id, (c) => ({ ...c, name })),
    setComponentVisible: (id, visible) =>
      mapComponent(id, (c) => ({ ...c, visible })),

    duplicateComponent: (id, name) => {
      const source = get().components.find((c) => c.id === id);
      if (!source) return null;
      const copy: Component = {
        ...structuredClone(source),
        id: newId(),
        name: name ?? source.name,
        origin: "user",
        geometry:
          source.geometry &&
          offsetGeometry(
            source.geometry,
            DUPLICATE_OFFSET_M,
            -DUPLICATE_OFFSET_M,
          ),
      };
      const components = [...get().components];
      components.splice(components.indexOf(source) + 1, 0, copy);
      commit({ components });
      get().selectComponent(copy.id);
      return copy.id;
    },

    removeComponent: (id) => {
      const components = get().components.filter((c) => c.id !== id);
      if (components.length === get().components.length) return;
      commit({ components });
    },

    setAreaBoundary: (areaBoundary) => commit({ areaBoundary }),

    loadDesign: ({ components, areaBoundary }) =>
      set({
        components,
        areaBoundary,
        past: [],
        future: [],
        selectedComponentId: null,
        selectedElement: null,
      }),

    startDrawing: (drawing) => {
      if (
        !toolsForTarget(drawing.target, get().components).includes(drawing.tool)
      )
        return;
      set({ drawing });
    },
    cancelDrawing: () => set({ drawing: null }),

    finishDrawing: (shape) => {
      const drawing = get().drawing;
      if (!drawing || shape.geometry.type !== geometryTypeOf(drawing.tool))
        return null;
      const { target } = drawing;
      set({ drawing: null });

      if (target.kind === "area") {
        if (shape.geometry.type !== "Polygon") return null;
        commit({ areaBoundary: { ...shape, geometry: shape.geometry } });
        return null;
      }
      if (target.kind === "new") {
        const id = get().addComponent({
          type: target.type,
          subtype: target.subtype,
          name: target.name,
          geometry: geometryForType(target.type, shape),
        });
        get().selectComponent(id);
        return id;
      }

      const c = get().components.find((x) => x.id === target.componentId);
      if (!c) return null;
      let geometry: ComponentGeometry | undefined;
      if (target.kind === "planned") {
        geometry = geometryForType(c.type, shape);
      } else if (target.kind === "section") {
        if (!c.geometry || shape.geometry.type !== "Polygon") return null;
        geometry = withSection(c.geometry, {
          ...shape,
          geometry: shape.geometry,
        });
      } else {
        if (!c.geometry) return null;
        geometry = withFeature(
          c.geometry,
          shape,
          target.featureKind,
          target.customLabel,
        );
      }
      get().setComponentGeometry(c.id, geometry);
      get().selectComponent(c.id);
      return c.id;
    },

    undo: () => {
      const { past, future } = get();
      const prev = past.at(-1);
      if (!prev) return;
      set({
        ...prev,
        past: past.slice(0, -1),
        future: [...future, snapshot()],
      });
      fixSelection();
    },
    redo: () => {
      const { past, future } = get();
      const next = future.at(-1);
      if (!next) return;
      set({
        ...next,
        past: [...past, snapshot()],
        future: future.slice(0, -1),
      });
      fixSelection();
    },
  };
};
