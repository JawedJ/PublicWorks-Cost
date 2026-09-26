import type {
  AnyFeature,
  BuildingSection,
  Component,
  ComponentGeometry,
  ComponentType,
  PolygonFeature,
} from "@/lib/schemas";

// What the user is drawing and with which tool, and how a finished shape
// becomes component geometry. Terra Draw only handles the shape while it is
// being drawn; the finished shape is written to the store (SPEC section 11).

export type DrawTool =
  | "polygon"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "freehand"
  | "line"
  | "freehandLine"
  | "point";

export const SHAPE_TOOLS: DrawTool[] = [
  "polygon",
  "rectangle",
  "circle",
  "ellipse",
  "freehand",
];
export const LINE_TOOLS: DrawTool[] = ["line", "freehandLine"];
export const ALL_TOOLS: DrawTool[] = [...SHAPE_TOOLS, ...LINE_TOOLS, "point"];

export type DrawTarget =
  /** A new component of this type. */
  | { kind: "new"; type: ComponentType; subtype: string; name: string }
  /** Gives a planned (undrawn) component its geometry. */
  | { kind: "planned"; componentId: string }
  /** Another footprint section for a building. */
  | { kind: "section"; componentId: string }
  /** A feature placed in a park (or other component). */
  | {
      kind: "feature";
      componentId: string;
      featureKind: string;
      customLabel?: string;
    }
  /** The optional outline of the general project area. */
  | { kind: "area" };

export type Drawing = { target: DrawTarget; tool: DrawTool };

/** Storeys for a newly drawn building section until the user sets them (P1.8). */
export const DEFAULT_STOREYS = 1;

/** Shapes each component type is drawn with (SPEC 11, Terra Draw modes per type). */
export function toolsForType(type: ComponentType): DrawTool[] {
  switch (type) {
    case "road":
      return LINE_TOOLS;
    case "park":
    case "building":
      return SHAPE_TOOLS;
    case "structure":
      // A pin, or a drawn span for bridges.
      return ["point", "line"];
    case "custom":
      return ALL_TOOLS;
  }
}

export function toolsForTarget(
  target: DrawTarget,
  components: Component[],
): DrawTool[] {
  switch (target.kind) {
    case "new":
      return toolsForType(target.type);
    case "planned": {
      const c = components.find((x) => x.id === target.componentId);
      return c ? toolsForType(c.type) : [];
    }
    case "section":
    case "area":
      return SHAPE_TOOLS;
    case "feature":
      return ALL_TOOLS;
  }
}

export function geometryTypeOf(tool: DrawTool): AnyFeature["geometry"]["type"] {
  if (tool === "point") return "Point";
  return LINE_TOOLS.includes(tool) ? "LineString" : "Polygon";
}

export function newId(): string {
  return crypto.randomUUID();
}

function isPolygon(f: AnyFeature): f is PolygonFeature {
  return f.geometry.type === "Polygon";
}

function sectionFrom(footprint: PolygonFeature): BuildingSection {
  return {
    id: newId(),
    footprint,
    storeys: DEFAULT_STOREYS,
    roof: "flat",
  };
}

/**
 * Geometry for a component drawn from scratch. A building's first shape is both
 * its site and its first section; a separate site can be drawn later.
 */
export function geometryForType(
  type: ComponentType,
  shape: AnyFeature,
): ComponentGeometry {
  if (type === "building" && isPolygon(shape)) {
    return { primary: shape, sections: [sectionFrom(shape)], features: [] };
  }
  return { primary: shape, features: [] };
}

/** Adds a drawn section to a building's geometry. */
export function withSection(
  g: ComponentGeometry,
  footprint: PolygonFeature,
): ComponentGeometry {
  return { ...g, sections: [...(g.sections ?? []), sectionFrom(footprint)] };
}

/** Adds a drawn feature (e.g. a playground in a park). */
export function withFeature(
  g: ComponentGeometry,
  shape: AnyFeature,
  kind: string,
  customLabel?: string,
): ComponentGeometry {
  return {
    ...g,
    features: [
      ...g.features,
      { id: newId(), kind, customLabel, geometry: shape, params: {} },
    ],
  };
}
