"use client";

import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { GeoJSONStoreFeatures, TerraDraw } from "terra-draw";
import { useEffect, useRef, useState } from "react";
import type { DrawTool } from "@/lib/geo/drawing";
import { editableElements, pickElement, type ElementRef } from "@/lib/geo/edit";
import { mapColors } from "@/lib/render/colors";
import {
  AnyFeatureSchema,
  type AnyFeature,
  type Component,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { useMap } from "./map-context";

// Connects Terra Draw to the store. The store stays the single source of truth:
// - Drawing: Terra Draw holds the shape while it is drawn; the finished shape goes
//   to `finishDrawing` and is removed from Terra Draw.
// - Editing: the selected component's shapes are copied into Terra Draw's select
//   mode (drag shapes, drag/add/remove vertices). Each finished edit is written back
//   with `editElement` (one undo step), and the copies are re-synced from the store.

const modeName: Record<DrawTool, string> = {
  polygon: "polygon",
  rectangle: "rectangle",
  circle: "circle",
  ellipse: "ellipse",
  freehand: "freehand",
  line: "linestring",
  freehandLine: "freehand-linestring",
  point: "point",
};

/** When the last shape finished; the click that finishes a shape must not also select on the map. */
let lastFinishAt = 0;
export function justFinishedDrawing(): boolean {
  return performance.now() - lastFinishAt < 400;
}

/** Terra Draw's layers use this id prefix; component layers stay below them. */
export const DRAW_LAYER_PREFIX = "td";

/** Terra Draw rejects coordinates with more decimals than this (~1 cm). */
const PRECISION = 7;

// Terra Draw feature ids for a component's shapes: "<componentId>|p", "|s|<id>", "|f|<id>".
function editId(componentId: string, ref: ElementRef): string {
  return ref.role === "primary"
    ? `${componentId}|p`
    : `${componentId}|${ref.role === "section" ? "s" : "f"}|${ref.id}`;
}
function parseEditId(
  id: string,
): { componentId: string; ref: ElementRef } | null {
  const [componentId, kind, elementId] = id.split("|");
  if (!componentId) return null;
  if (kind === "p") return { componentId, ref: { role: "primary" } };
  if (!elementId) return null;
  if (kind === "s")
    return { componentId, ref: { role: "section", id: elementId } };
  if (kind === "f")
    return { componentId, ref: { role: "feature", id: elementId } };
  return null;
}

const round = (n: number) => Number(n.toFixed(PRECISION));

/** A shape as Terra Draw can edit it: outline only (holes are kept by the store), rounded. */
function toEditFeature(id: string, shape: AnyFeature): GeoJSONStoreFeatures {
  const g = shape.geometry;
  const geometry =
    g.type === "Point"
      ? { type: g.type, coordinates: g.coordinates.slice(0, 2).map(round) }
      : g.type === "LineString"
        ? {
            type: g.type,
            coordinates: g.coordinates.map((p) => p.slice(0, 2).map(round)),
          }
        : {
            type: g.type,
            coordinates: [
              g.coordinates[0]!.map((p) => p.slice(0, 2).map(round)),
            ],
          };
  const mode =
    g.type === "Point"
      ? "point"
      : g.type === "LineString"
        ? "linestring"
        : "polygon";
  return {
    id,
    type: "Feature",
    geometry,
    properties: { mode },
  } as GeoJSONStoreFeatures;
}

/** Edits that change a shape; `dragFeature` moves it whole. */
const EDIT_ACTIONS = new Set([
  "dragFeature",
  "dragCoordinate",
  "insertMidpoint",
  "deleteCoordinate",
  "dragCoordinateResize",
]);

/** The component whose shapes are editable on the map: selected, drawn, visible, and not while drawing. */
export function editableComponent(s: {
  drawing: unknown;
  components: Component[];
  selectedComponentId: string | null;
}): Component | undefined {
  if (s.drawing) return undefined;
  const c = s.components.find((x) => x.id === s.selectedComponentId);
  return c?.visible && c.geometry ? c : undefined;
}

const accent = mapColors.selected as `#${string}`;
const white = "#ffffff" as const;

async function createDraw(map: MapLibreMap): Promise<TerraDraw> {
  const td = await import("terra-draw");
  const { TerraDrawMapLibreGLAdapter } =
    await import("terra-draw-maplibre-gl-adapter");
  const polygonStyles = {
    fillColor: accent,
    fillOpacity: 0.2,
    outlineColor: accent,
    outlineWidth: 2,
  };
  // Reject self-crossing outlines: their area can't be measured.
  const notSelfIntersecting = {
    validation: (
      feature: Parameters<typeof td.ValidateNotSelfIntersecting>[0],
      { updateType }: { updateType: string },
    ) =>
      updateType === "finish" || updateType === "commit"
        ? td.ValidateNotSelfIntersecting(feature)
        : { valid: true },
  };
  const editFlags = {
    feature: {
      draggable: true,
      selfIntersectable: false,
      coordinates: {
        draggable: true,
        midpoints: { draggable: true },
        deletable: true,
      },
    },
  };
  const draw = new td.TerraDraw({
    // Our ids are uuids or fixture ids joined with "|"; see `editId`.
    idStrategy: {
      isValidId: (id) => typeof id === "string" && id.length > 0,
      getId: () => crypto.randomUUID(),
    },
    adapter: new TerraDrawMapLibreGLAdapter({
      map,
      prefixId: DRAW_LAYER_PREFIX,
      coordinatePrecision: 7,
    }),
    modes: [
      new td.TerraDrawPolygonMode({
        styles: { ...polygonStyles, closingPointColor: accent },
        ...notSelfIntersecting,
      }),
      new td.TerraDrawRectangleMode({ styles: polygonStyles }),
      new td.TerraDrawCircleMode({ styles: polygonStyles, segments: 64 }),
      new td.TerraDrawEllipseMode({ styles: polygonStyles, segments: 64 }),
      new td.TerraDrawFreehandMode({
        styles: polygonStyles,
        smoothing: 0.5,
        ...notSelfIntersecting,
      }),
      new td.TerraDrawLineStringMode({
        styles: {
          lineStringColor: accent,
          lineStringWidth: 3,
          closingPointColor: accent,
        },
      }),
      new td.TerraDrawFreehandLineStringMode({
        styles: { lineStringColor: accent, lineStringWidth: 3 },
      }),
      new td.TerraDrawPointMode({
        styles: {
          pointColor: accent,
          pointWidth: 7,
          pointOutlineColor: white,
          pointOutlineWidth: 2,
        },
      }),
      new td.TerraDrawSelectMode({
        // Grab distance for points and edges; the 40 px default grabs corners when dragging small shapes.
        pointerDistance: 16,
        flags: {
          polygon: editFlags,
          linestring: editFlags,
          point: { feature: { draggable: true } },
        },
        // Delete, rotate and scale are handled by the edit bar and transform handles.
        keyEvents: null,
        // Clicks are handled by `DrawController` (Terra Draw's hit test can pick a site over the section inside it).
        allowManualSelection: false,
        allowManualDeselection: false,
        styles: {
          selectedPolygonColor: accent,
          selectedPolygonFillOpacity: 0.15,
          selectedPolygonOutlineColor: accent,
          selectedPolygonOutlineWidth: 2,
          selectedLineStringColor: accent,
          selectedLineStringWidth: 3,
          selectedPointColor: accent,
          selectedPointWidth: 7,
          selectedPointOutlineColor: white,
          selectedPointOutlineWidth: 2,
          selectionPointColor: white,
          selectionPointWidth: 5,
          selectionPointOutlineColor: accent,
          selectionPointOutlineWidth: 2,
          midPointColor: accent,
          midPointWidth: 3,
          midPointOutlineColor: white,
          midPointOutlineWidth: 1,
        },
      }),
    ],
  });
  draw.start();
  return draw;
}

/** Our shapes in Terra Draw, without its own vertex and midpoint handles. */
function ownFeatures(draw: TerraDraw): GeoJSONStoreFeatures[] {
  return draw.getSnapshot().filter((f) => parseEditId(String(f.id)));
}

/** Copies the component's editable shapes into Terra Draw, updating only what changed. */
function syncEditFeatures(draw: TerraDraw, c: Component | undefined) {
  const wanted = new Map(
    (c ? editableElements(c) : []).map(({ ref, shape }) => {
      const id = editId(c!.id, ref);
      return [id, toEditFeature(id, shape)] as const;
    }),
  );
  const existing = new Map(ownFeatures(draw).map((f) => [String(f.id), f]));
  const stale = [...existing.keys()].filter((id) => !wanted.has(id));
  if (stale.length) draw.removeFeatures(stale);
  const added: GeoJSONStoreFeatures[] = [];
  for (const [id, f] of wanted) {
    const old = existing.get(id);
    if (!old) added.push(f);
    else if (JSON.stringify(old.geometry) !== JSON.stringify(f.geometry)) {
      try {
        draw.updateFeatureGeometry(id, f.geometry);
      } catch {
        // Terra Draw rejected the new shape; drop its copy rather than show a stale one.
        draw.removeFeatures([id]);
      }
    }
  }
  // Shapes Terra Draw can't represent are skipped; the transform handles still move them.
  if (added.length) draw.addFeatures(added);
}

/** Selects the store's selected element in Terra Draw, else the component's main shape. */
function selectInDraw(draw: TerraDraw, c: Component) {
  const own = ownFeatures(draw);
  if (own.some((f) => f.properties.selected)) return;
  const ids = own.map((f) => String(f.id));
  const el = useStore.getState().selectedElement;
  const wanted = el?.sectionId
    ? editId(c.id, { role: "section", id: el.sectionId })
    : el?.featureId
      ? editId(c.id, { role: "feature", id: el.featureId })
      : undefined;
  const id = (wanted && ids.includes(wanted) ? wanted : undefined) ?? ids[0];
  if (id) draw.selectFeature(id);
}

/** Runs Terra Draw for the store's current `drawing` request, or edits the selected component. Renders nothing. */
export function DrawController() {
  const map = useMap();
  const drawing = useStore((s) => s.drawing);
  const editing = useStore(editableComponent);
  const drawRef = useRef<TerraDraw | null>(null);
  // Bumped when Terra Draw is (re)created, so the sync effect runs again.
  const [generation, setGeneration] = useState(0);

  // Create Terra Draw, and recreate it after a basemap switch (setStyle drops its layers).
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    // A style load can start a second setup before the first finishes; only the latest survives.
    let latest = 0;

    const setup = async () => {
      const attempt = ++latest;
      teardown();
      const draw = await createDraw(map);
      if (cancelled || attempt !== latest) return draw.stop();
      drawRef.current = draw;
      draw.on("finish", (id, context) => {
        if (context.mode === "select") {
          if (!EDIT_ACTIONS.has(context.action)) return;
          const target = parseEditId(String(id));
          const shape = AnyFeatureSchema.safeParse({
            type: "Feature",
            properties: {},
            geometry: draw.getSnapshotFeature(id)?.geometry,
          });
          if (target && shape.success)
            useStore
              .getState()
              .editElement(
                target.componentId,
                target.ref,
                shape.data,
                context.action === "dragFeature",
              );
          return;
        }
        lastFinishAt = performance.now();
        const f = draw.getSnapshotFeature(id);
        // Remove it from Terra Draw after it finishes its own bookkeeping.
        queueMicrotask(() => {
          if (draw.enabled) draw.removeFeatures([id]);
        });
        const shape = AnyFeatureSchema.safeParse({
          type: "Feature",
          properties: {},
          geometry: f?.geometry,
        });
        if (shape.success) useStore.getState().finishDrawing(shape.data);
        else useStore.getState().cancelDrawing();
      });
      setGeneration((n) => n + 1);
    };
    const teardown = () => {
      try {
        drawRef.current?.stop();
      } catch {
        // Its layers may already be gone with the old style.
      }
      drawRef.current = null;
    };
    const onStyle = () => void setup();

    // Clicking one of the edited component's shapes selects it, so it can be dragged or reshaped.
    const onClick = (e: MapMouseEvent) => {
      const draw = drawRef.current;
      const c = editableComponent(useStore.getState());
      if (!draw?.enabled || !c || draw.getMode() !== "select") return;
      const ref = pickElement(
        editableElements(c),
        [e.lngLat.lng, e.lngLat.lat],
        (p) => {
          const { x, y } = map.project([p[0], p[1]]);
          return [x, y];
        },
      );
      if (!ref) return;
      const id = editId(c.id, ref);
      if (!ownFeatures(draw).some((f) => f.id === id)) return;
      draw.selectFeature(id);
      useStore.getState().selectElement({
        componentId: c.id,
        sectionId: ref.role === "section" ? ref.id : undefined,
        featureId: ref.role === "feature" ? ref.id : undefined,
      });
    };

    void setup();
    map.on("style.load", onStyle);
    map.on("click", onClick);
    return () => {
      cancelled = true;
      map.off("style.load", onStyle);
      map.off("click", onClick);
      teardown();
    };
  }, [map]);

  // Follow the store: a drawing mode while drawing, select mode while editing, idle otherwise.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw?.enabled) return;
    if (drawing) {
      if (draw.getMode() === "select") draw.clear();
      draw.setMode(modeName[drawing.tool]);
    } else if (editing) {
      if (draw.getMode() !== "select") {
        draw.clear();
        draw.setMode("select");
      }
      syncEditFeatures(draw, editing);
      selectInDraw(draw, editing);
    } else {
      draw.setMode("static");
      draw.clear();
    }
  }, [drawing, editing, generation]);

  // Escape cancels drawing, or clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true], [role=menu]"))
        return;
      const store = useStore.getState();
      if (store.drawing) store.cancelDrawing();
      else store.selectComponent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
