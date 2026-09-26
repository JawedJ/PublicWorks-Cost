"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import type { TerraDraw } from "terra-draw";
import { useEffect, useRef } from "react";
import type { DrawTool } from "@/lib/geo/drawing";
import { mapColors } from "@/lib/render/colors";
import { AnyFeatureSchema } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { useMap } from "./map-context";

// Connects Terra Draw to the store. Terra Draw only holds the shape while it is
// being drawn; the finished shape goes to `finishDrawing` and is removed from
// Terra Draw, so the store stays the single source of truth.

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
  const draw = new td.TerraDraw({
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
    ],
  });
  draw.start();
  return draw;
}

/** Runs Terra Draw for the store's current `drawing` request. Renders nothing. */
export function DrawController() {
  const map = useMap();
  const drawing = useStore((s) => s.drawing);
  const drawRef = useRef<TerraDraw | null>(null);

  // Create Terra Draw, and recreate it after a basemap switch (setStyle drops its layers).
  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    const setup = async () => {
      teardown();
      const draw = await createDraw(map);
      if (cancelled) return draw.stop();
      drawRef.current = draw;
      draw.on("finish", (id) => {
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
      const current = useStore.getState().drawing;
      if (current) draw.setMode(modeName[current.tool]);
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

    void setup();
    map.on("style.load", onStyle);
    return () => {
      cancelled = true;
      map.off("style.load", onStyle);
      teardown();
    };
  }, [map]);

  // Follow the store: switch mode when drawing starts, go idle when it ends.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw?.enabled) return;
    if (drawing) {
      draw.setMode(modeName[drawing.tool]);
    } else {
      draw.setMode("static");
      draw.clear();
    }
  }, [drawing]);

  // Escape cancels drawing.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useStore.getState().cancelDrawing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing]);

  return null;
}
