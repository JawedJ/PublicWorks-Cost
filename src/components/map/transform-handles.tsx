"use client";

import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { componentBounds } from "@/lib/geo/bounds";
import { transformGeometry } from "@/lib/geo/edit";
import {
  localFrame,
  rotateAbout,
  scaleAbout,
  type PositionFn,
} from "@/lib/geo/transform";
import type { Component, ComponentGeometry, Position } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";
import { editableComponent } from "./draw-controller";
import { useMap } from "./map-context";

// Move, rotate and scale handles around the selected component's bounding box
// (SPEC 11, "Editing, without limits"). They transform the whole component: its
// main shape, sections and features together. A drag previews live and is one
// undo step. Shift keeps proportions while scaling and snaps rotation to 15°.

/** CSS class on every handle, so map clicks on them are ignored. */
export const HANDLE_CLASS = "pw-handle";

type HandleKind = "move" | "rotate" | "nw" | "ne" | "se" | "sw";
const CORNERS = ["nw", "ne", "se", "sw"] as const;
/** Distance of the rotate handle above the box, in screen pixels. */
const ROTATE_GAP_PX = 28;
const SNAP_DEGREES = 15;
const MIN_SCALE = 0.05;

type Box = { w: number; s: number; e: number; n: number };

function boxOf(c: Component): Box | null {
  const b = componentBounds(c);
  if (!b) return null;
  return { w: b[0], s: b[1], e: b[2], n: b[3] };
}

function cornerOf(box: Box, k: (typeof CORNERS)[number]): Position {
  return [k.includes("w") ? box.w : box.e, k.includes("s") ? box.s : box.n];
}
const opposite = { nw: "se", ne: "sw", se: "nw", sw: "ne" } as const;

function centreOf(box: Box): Position {
  return [(box.w + box.e) / 2, (box.s + box.n) / 2];
}

/** Where each handle sits for this box at the current zoom. */
function handlePositions(map: MapLibreMap, box: Box) {
  const top = map.project([(box.w + box.e) / 2, box.n]);
  const rotate = map.unproject([top.x, top.y - ROTATE_GAP_PX]);
  return {
    move: centreOf(box),
    rotate: [rotate.lng, rotate.lat] as Position,
    ...Object.fromEntries(CORNERS.map((k) => [k, cornerOf(box, k)])),
  } as Record<HandleKind, Position>;
}

/** True when the component is a single point (nothing to rotate or scale). */
function isTiny(box: Box) {
  return box.e - box.w < 1e-9 && box.n - box.s < 1e-9;
}

type Gesture = {
  kind: HandleKind;
  componentId: string;
  /** Scale keeps proportions (a rotated parking lot would otherwise skew out of a rectangle). */
  keepShape: boolean;
  before: ComponentGeometry;
  box: Box;
  start: Position;
  latest: ComponentGeometry;
};

/** Whether the main shape's edges run along the map axes (an unrotated rectangle). */
function axisAligned(g: ComponentGeometry): boolean {
  const geom = g.primary.geometry;
  if (geom.type !== "Polygon") return true;
  const ring = geom.coordinates[0]!;
  return ring.slice(1).every((p, i) => {
    const q = ring[i]!;
    return Math.abs(p[0] - q[0]) < 1e-7 || Math.abs(p[1] - q[1]) < 1e-7;
  });
}

/** The transform a handle dragged from `g.start` to `now` applies. */
function transformFor(g: Gesture, now: Position, shift: boolean): PositionFn {
  const centre = centreOf(g.box);
  if (g.kind === "move") {
    const dLng = now[0] - g.start[0];
    const dLat = now[1] - g.start[1];
    return ([lng, lat, ...rest]) => [lng + dLng, lat + dLat, ...rest];
  }
  const { toLocal } = localFrame(centre);
  if (g.kind === "rotate") {
    const [x0, y0] = toLocal(g.start);
    const [x1, y1] = toLocal(now);
    let deg = ((Math.atan2(y1, x1) - Math.atan2(y0, x0)) * 180) / Math.PI;
    if (shift) deg = Math.round(deg / SNAP_DEGREES) * SNAP_DEGREES;
    return rotateAbout(centre, deg);
  }
  const anchor = cornerOf(g.box, opposite[g.kind]);
  const [ax, ay] = toLocal(anchor);
  const [sx0, sy0] = toLocal(g.start);
  const [x, y] = toLocal(now);
  // An axis with no extent (e.g. a straight east–west road) can't be scaled on its own.
  const factor = (to: number, from: number, a: number) =>
    Math.abs(from - a) < 0.01 ? null : (to - a) / (from - a);
  let sx = factor(x, sx0, ax);
  let sy = factor(y, sy0, ay);
  if (shift || sx === null || sy === null) {
    const s =
      sx === null
        ? (sy ?? 1)
        : sy === null
          ? sx
          : Math.max(Math.abs(sx), Math.abs(sy));
    sx = s;
    sy = s;
  }
  return scaleAbout(anchor, Math.max(sx, MIN_SCALE), Math.max(sy, MIN_SCALE));
}

function labelFor(
  kind: HandleKind,
  labels: { move: string; rotate: string; scale: string },
): string {
  return kind === "move" || kind === "rotate" ? labels[kind] : labels.scale;
}

function handleElement(kind: HandleKind, label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `${HANDLE_CLASS} ${HANDLE_CLASS}-${kind}`;
  el.title = label;
  el.setAttribute("aria-label", label);
  el.setAttribute("role", "img");
  return el;
}

/** Transform handles for the selected component. Renders nothing itself; handles are map markers. */
export function TransformHandles() {
  const t = useTranslations("design.edit.handles");
  const map = useMap();
  const component = useStore(editableComponent);
  const markers = useRef<Partial<Record<HandleKind, Marker>>>({});
  const gesture = useRef<Gesture | null>(null);
  /** The component the handles belong to; the markers' drag listeners read it. */
  const editedId = useRef<string | null>(null);
  const shiftDown = useRef(false);
  const labels = useRef({ move: "", rotate: "", scale: "" });
  // Labels for the handles, kept current when the language changes.
  useEffect(() => {
    labels.current = {
      move: t("move"),
      rotate: t("rotate"),
      scale: t("scale"),
    };
    for (const [kind, m] of Object.entries(markers.current)) {
      const label = labelFor(kind as HandleKind, labels.current);
      m?.getElement().setAttribute("aria-label", label);
      m?.getElement().setAttribute("title", label);
    }
  }, [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (shiftDown.current = e.shiftKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Create or remove the markers when the edited component changes, and keep them on its box.
  useEffect(() => {
    if (!map) return;
    const box = component && boxOf(component);
    if (!component || !box || isTiny(box)) {
      Object.values(markers.current).forEach((m) => m?.remove());
      markers.current = {};
      return;
    }
    editedId.current = component.id;
    let cancelled = false;

    const place = () => {
      const current = useStore
        .getState()
        .components.find((c) => c.id === component.id);
      const b = current && boxOf(current);
      if (!b) return;
      const pos = handlePositions(map, b);
      for (const [kind, m] of Object.entries(markers.current)) {
        if (gesture.current?.kind === kind) continue;
        m?.setLngLat(pos[kind as HandleKind] as [number, number]);
      }
    };

    const ensure = async () => {
      if (markers.current.move) return place();
      const { Marker } = await import("maplibre-gl");
      if (cancelled || markers.current.move) return place();
      const kinds: HandleKind[] = ["move", "rotate", ...CORNERS];
      const pos = handlePositions(map, box);
      for (const kind of kinds) {
        const label = labelFor(kind, labels.current);
        const m = new Marker({
          element: handleElement(kind, label),
          draggable: true,
        })
          .setLngLat(pos[kind] as [number, number])
          .addTo(map);
        m.on("dragstart", () => onDragStart(kind, m));
        m.on("drag", () => onDrag(m));
        m.on("dragend", () => onDragEnd());
        markers.current[kind] = m;
      }
    };

    const onDragStart = (kind: HandleKind, m: Marker) => {
      const c = useStore
        .getState()
        .components.find((x) => x.id === editedId.current);
      const b = c && boxOf(c);
      if (!c?.geometry || !b) return;
      const { lng, lat } = m.getLngLat();
      gesture.current = {
        kind,
        componentId: c.id,
        keepShape: c.type === "parking" && !axisAligned(c.geometry),
        before: c.geometry,
        box: b,
        start: [lng, lat],
        latest: c.geometry,
      };
    };
    let frame = 0;
    const onDrag = (m: Marker) => {
      const g = gesture.current;
      if (!g) return;
      const { lng, lat } = m.getLngLat();
      const fn = transformFor(g, [lng, lat], shiftDown.current || g.keepShape);
      g.latest = transformGeometry(g.before, fn);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const cur = gesture.current;
        if (cur)
          useStore
            .getState()
            .previewComponentGeometry(cur.componentId, cur.latest);
      });
    };
    const onDragEnd = () => {
      const g = gesture.current;
      gesture.current = null;
      cancelAnimationFrame(frame);
      frame = 0;
      if (!g) return;
      if (g.latest !== g.before)
        useStore
          .getState()
          .endGeometryPreview(g.componentId, g.before, g.latest);
      place();
    };

    void ensure();
    map.on("zoom", place);
    map.on("rotate", place);
    return () => {
      cancelled = true;
      map.off("zoom", place);
      map.off("rotate", place);
    };
  }, [map, component]);

  // Remove the markers when unmounting.
  useEffect(
    () => () => {
      Object.values(markers.current).forEach((m) => m?.remove());
      markers.current = {};
    },
    [],
  );

  return null;
}
