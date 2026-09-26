import type { StateCreator } from "zustand";
import type {
  AnyFeature,
  BuildingSection,
  Component,
  ComponentGeometry,
  ComponentType,
  PolygonFeature,
  Position,
} from "@/lib/schemas";
import {
  geometryForType,
  geometryTypeOf,
  newId,
  toolsForTarget,
  withFeature,
  withSection,
  type Drawing,
  type DrawTarget,
} from "@/lib/geo/drawing";
import {
  componentCentre,
  holeTarget,
  withElementShape,
  withHole,
  withMergedSections,
  withoutElement,
  withPrimaryMoved,
  transformGeometry,
  type ElementRef,
} from "@/lib/geo/edit";
import {
  generateLayout as generateLayoutFor,
  pickProjectArea,
  withPlannedFeatures,
  smartGeometry,
} from "@/lib/geo/generate";
import type { Surroundings } from "@/lib/geo/site-layout";
import { capitalizeName } from "@/lib/names";
import { mirrorAbout, translateFeature } from "@/lib/geo/transform";
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
  /** Zoning map layer (Waterloo) on or off. */
  showZoning: boolean;
  /** "Things to check" highlighted on the map (buildings in the way, creeks, schools…). */
  showIssues: boolean;
  unitSystem: UnitSystem;
  /** Undo/redo stacks; most recent last. */
  past: DesignSnapshot[];
  future: DesignSnapshot[];
  /** The shape being drawn on the map, or `null` when not drawing. */
  drawing: Drawing | null;
  /** Waiting for a map click to drop a smart-start shape for this target (P1.9). */
  smartPlacing: Extract<DrawTarget, { kind: "new" | "planned" }> | null;
  /** Roads drawn with the line tool follow the street network (P1.17). */
  snapToStreets: boolean;
  setSnapToStreets: (on: boolean) => void;
  /** Seed of the last generated layout; Regenerate uses the next one. */
  layoutSeed: number;
  /** Why the last finished shape was not applied (shown by the draw toolbar). */
  drawNotice: "holeOutside" | null;

  /** Select a whole component (or clear with `null`). */
  selectComponent: (componentId: string | null) => void;
  /** Select an element; also selects its component. */
  selectElement: (element: SelectedElement | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setColourByCost: (on: boolean) => void;
  setShowZoning: (on: boolean) => void;
  setShowIssues: (on: boolean) => void;
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
  /** Applies several component patches as one undo step (e.g. "apply to all similar"). */
  updateComponents: (
    patches: {
      id: string;
      patch: Partial<Omit<Component, "id" | "type" | "status">>;
    }[],
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
  /**
   * Shows a geometry during a drag without recording history. End the drag with
   * `endGeometryPreview` so the whole drag is one undo step.
   */
  previewComponentGeometry: (id: string, geometry: ComponentGeometry) => void;
  /** Ends a live drag that started from `before`, committing `after` as one undo step. */
  endGeometryPreview: (
    id: string,
    before: ComponentGeometry,
    after: ComponentGeometry,
  ) => void;
  /**
   * Writes back one edited shape. `moved` means the primary shape was dragged,
   * so everything inside it (sections, features) moves with it.
   */
  editElement: (
    componentId: string,
    ref: ElementRef,
    shape: AnyFeature,
    moved?: boolean,
  ) => void;
  /** Flips a whole component about its centre. */
  mirrorComponent: (id: string, axis: "vertical" | "horizontal") => void;
  /** Changes a building section's storeys, roof, floor height or use. */
  updateSection: (
    componentId: string,
    sectionId: string,
    patch: Partial<
      Pick<BuildingSection, "storeys" | "roof" | "floorHeightM" | "use">
    >,
  ) => void;
  /** Merges sections into one polygon (only if they touch or overlap). Returns false if they can't merge. */
  mergeSections: (componentId: string, sectionIds: string[]) => boolean;
  /** Deletes a building section or placed feature (not the last section). */
  removeElement: (componentId: string, ref: ElementRef) => void;
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

  /** Waits for a map click to drop a smart-start shape (or stops waiting with `null`). */
  startSmartPlacing: (target: DesignSlice["smartPlacing"]) => void;
  /** Drops the procedurally generated starting shape at `centre`, facing `bearingDeg`. One undo step. */
  placeSmart: (centre: Position, bearingDeg?: number) => string | null;
  /**
   * Places every planned component (and re-places generated ones that weren't edited)
   * around `centre` as one undo step. Returns how many were placed.
   */
  generateLayout: (
    centre: Position,
    seed?: number,
    surroundings?: Surroundings,
  ) => number;

  undo: () => void;
  redo: () => void;
};

export { newId };

export function createComponent(input: NewComponentInput): Component {
  return {
    id: input.id ?? newId(),
    name: capitalizeName(input.name),
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
    showZoning: false,
    showIssues: true,
    unitSystem: "metric",
    past: [],
    future: [],
    drawing: null,
    drawNotice: null,
    smartPlacing: null,
    snapToStreets: false,
    setSnapToStreets: (snapToStreets) => set({ snapToStreets }),
    layoutSeed: 1,

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
    setShowZoning: (showZoning) => set({ showZoning }),
    setShowIssues: (showIssues) => set({ showIssues }),
    setUnitSystem: (unitSystem) => set({ unitSystem }),

    addComponent: (input) => get().addComponents([input])[0]!,
    addComponents: (inputs) => {
      const created = inputs.map(createComponent);
      commit({ components: [...get().components, ...created] });
      return created.map((c) => c.id);
    },
    updateComponents: (patches) => {
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      if (!get().components.some((c) => byId.has(c.id))) return;
      commit({
        components: get().components.map((c) =>
          byId.has(c.id) ? { ...c, ...byId.get(c.id) } : c,
        ),
      });
    },
    updateComponent: (id, patch) =>
      mapComponent(id, (c) => ({ ...c, ...patch })),
    setComponentGeometry: (id, geometry, origin = "user") =>
      mapComponent(id, (c) => ({ ...c, geometry, status: "drawn", origin })),
    previewComponentGeometry: (id, geometry) =>
      set((s) => ({
        components: s.components.map((c) =>
          c.id === id ? { ...c, geometry } : c,
        ),
      })),
    endGeometryPreview: (id, before, after) => {
      get().previewComponentGeometry(id, before);
      get().setComponentGeometry(id, after);
    },
    editElement: (componentId, ref, shape, moved = false) => {
      const g = get().components.find((c) => c.id === componentId)?.geometry;
      if (!g) return;
      const next =
        moved && ref.role === "primary"
          ? withPrimaryMoved(g, shape)
          : withElementShape(g, ref, shape, moved);
      if (next) get().setComponentGeometry(componentId, next);
    },
    mirrorComponent: (id, axis) => {
      const c = get().components.find((x) => x.id === id);
      const centre = c && componentCentre(c);
      if (!c?.geometry || !centre) return;
      get().setComponentGeometry(
        id,
        transformGeometry(c.geometry, mirrorAbout(centre, axis), true),
      );
    },
    updateSection: (componentId, sectionId, patch) => {
      const g = get().components.find((c) => c.id === componentId)?.geometry;
      if (!g?.sections?.some((s) => s.id === sectionId)) return;
      get().setComponentGeometry(componentId, {
        ...g,
        sections: g.sections.map((s) =>
          s.id === sectionId ? { ...s, ...patch } : s,
        ),
      });
    },
    mergeSections: (componentId, sectionIds) => {
      const g = get().components.find((c) => c.id === componentId)?.geometry;
      const next = g && withMergedSections(g, sectionIds);
      if (!next) return false;
      get().setComponentGeometry(componentId, next);
      return true;
    },
    removeElement: (componentId, ref) => {
      const g = get().components.find((c) => c.id === componentId)?.geometry;
      const next = g && withoutElement(g, ref);
      if (next) get().setComponentGeometry(componentId, next);
    },
    clearComponentGeometry: (id) =>
      mapComponent(id, (c) => ({
        ...c,
        geometry: undefined,
        status: "planned",
      })),
    renameComponent: (id, name) =>
      mapComponent(id, (c) => ({ ...c, name: capitalizeName(name) })),
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
      set({ drawing, drawNotice: null, smartPlacing: null });
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
          name: capitalizeName(target.name),
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
      } else if (target.kind === "hole") {
        const ref = holeTarget(c, target);
        if (!c.geometry || !ref || shape.geometry.type !== "Polygon")
          return null;
        const next = withHole(c.geometry, ref, {
          ...shape,
          geometry: shape.geometry,
        });
        if (!next) {
          set({ drawNotice: "holeOutside" });
          return null;
        }
        geometry = next;
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

    startSmartPlacing: (smartPlacing) => set({ smartPlacing, drawing: null }),
    placeSmart: (centre, bearingDeg = 0) => {
      const target = get().smartPlacing;
      set({ smartPlacing: null });
      if (!target) return null;
      if (target.kind === "new") {
        const id = get().addComponent({
          type: target.type,
          subtype: target.subtype,
          name: capitalizeName(target.name),
          geometry: smartGeometry(
            { type: target.type, subtype: target.subtype, params: {} },
            centre,
            bearingDeg,
          ),
        });
        get().selectComponent(id);
        return id;
      }
      const c = get().components.find((x) => x.id === target.componentId);
      if (!c) return null;
      get().setComponentGeometry(
        c.id,
        withPlannedFeatures(c, smartGeometry(c, centre, bearingDeg)),
      );
      get().selectComponent(c.id);
      return c.id;
    },
    generateLayout: (centre, seed, surroundings) => {
      const layoutSeed = seed ?? get().layoutSeed;
      const isTarget = (c: Component) =>
        c.status === "planned" || c.origin === "generated";
      const targets = get().components.filter(isTarget);
      if (!targets.length) return 0;
      // What the user drew themselves stays put, so the layout builds around it.
      const own = get().components.filter((c) => !isTarget(c) && c.geometry);
      const shapes = own.flatMap((c) => {
        const g = c.geometry!.primary.geometry;
        return g.type === "Polygon" ? [g.coordinates[0]!] : [];
      });
      const lines = own.flatMap((c) => {
        const g = c.geometry!.primary.geometry;
        return g.type === "LineString" ? [g.coordinates] : [];
      });
      const ground = surroundings && {
        ...surroundings,
        blocked: [...surroundings.blocked, ...shapes],
        keepClear: [...surroundings.keepClear, ...lines],
      };
      // No project area yet: pick one first (sized for the build list, on open
      // land), show it, and lay everything out inside it.
      let areaBoundary = get().areaBoundary;
      if (!areaBoundary) {
        const ring = pickProjectArea(targets, centre, layoutSeed, ground);
        if (ring)
          areaBoundary = {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [ring] },
          };
      }
      const boundary = areaBoundary?.geometry.coordinates[0];
      const areaCentre: Position = boundary
        ? [
            boundary.slice(0, -1).reduce((a, p) => a + p[0], 0) /
              (boundary.length - 1),
            boundary.slice(0, -1).reduce((a, p) => a + p[1], 0) /
              (boundary.length - 1),
          ]
        : centre;
      const placed = generateLayoutFor(
        targets,
        areaCentre,
        layoutSeed,
        ground,
        boundary,
      );
      set({ layoutSeed });
      commit({
        areaBoundary,
        components: get().components.map((c) =>
          placed[c.id]
            ? {
                ...c,
                geometry: withPlannedFeatures(c, placed[c.id]!),
                status: "drawn",
                origin: "generated",
              }
            : c,
        ),
      });
      return Object.keys(placed).length;
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
