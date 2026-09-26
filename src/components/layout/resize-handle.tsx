"use client";

import { useRef } from "react";

/**
 * Vertical drag handle for resizing a side panel (desktop only).
 * `side` is which edge of the panel the handle sits on: dragging it away from
 * the panel makes the panel wider.
 */
export function ResizeHandle({
  side,
  label,
  getWidth,
  onResize,
}: {
  side: "left" | "right";
  label: string;
  getWidth: () => number;
  onResize: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const dir = side === "right" ? 1 : -1;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      className={`absolute top-0 z-20 hidden h-full w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-primary/60 focus-visible:outline-none focus-visible:after:bg-primary lg:block ${
        side === "right" ? "-right-1" : "-left-1"
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width: getWidth() };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onResize(start.current.width + dir * (e.clientX - start.current.x));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        start.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") onResize(getWidth() - dir * step);
        else if (e.key === "ArrowRight") onResize(getWidth() + dir * step);
        else return;
        e.preventDefault();
      }}
    />
  );
}
