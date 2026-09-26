"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { resolveParams } from "@/engine/params";
import { templates } from "@/engine/templates";
import { roadProfile } from "@/lib/render/plan";
import type { Component } from "@/lib/schemas";

// Road cross-section (P9.1), generated from the road's parameters: sidewalks,
// boulevards, curbs, parking, bike lanes, travel lanes, and buried pipes.
// Hover or click an element to see its width.

const FILL = {
  sidewalk: "#d4d4d8",
  boulevard: "#a3cf7a",
  curb: "#9ca3af",
  parking: "#6b7280",
  bike: "#2f9e57",
  lane: "#51565e",
  track: "#3fae6a",
};

type Strip = { key: keyof typeof FILL; widthM: number; fill: string };

export function RoadCrossSection({ road }: { road: Component }) {
  const t = useTranslations("visuals.crossSection");
  const [picked, setPicked] = useState<number | null>(null);
  const r = roadProfile(road);
  const p = resolveParams(templates.road, road.subtype, road.params);
  const blvd = typeof p.boulevardWidthM === "number" ? p.boulevardWidthM : 2.5;

  // One side, from the property line to the centre; mirrored for the other side.
  const side = (s: 0 | 1): Strip[] => {
    const out: Strip[] = [];
    if (r.sidewalkSides > s) {
      out.push({
        key: "sidewalk",
        widthM: r.sidewalkWidthM,
        fill: FILL.sidewalk,
      });
      out.push({ key: "boulevard", widthM: blvd, fill: FILL.boulevard });
    }
    if (r.cycling === "cycle_track")
      out.push({ key: "track", widthM: 2, fill: FILL.track });
    out.push({ key: "curb", widthM: 0.3, fill: FILL.curb });
    if (r.parkingLanes > s)
      out.push({ key: "parking", widthM: 2.4, fill: FILL.parking });
    if (r.cycling === "painted_lane")
      out.push({ key: "bike", widthM: 1.8, fill: FILL.bike });
    return out;
  };
  const lanes: Strip[] = Array.from({ length: r.lanes }, () => ({
    key: "lane" as const,
    widthM: r.laneWidthM,
    fill: FILL.lane,
  }));
  const strips = [...side(0), ...lanes, ...side(1).reverse()];
  const total = strips.reduce((s, x) => s + x.widthM, 0);

  const W = 260;
  const scale = W / total;
  const surfaceY = 30;
  const pipes = [
    p.watermain && {
      key: "watermain",
      d: Number(p.watermainDiameterMm ?? 200),
      x: 0.35,
      depth: 1.8,
      color: "#2563eb",
    },
    p.stormSewer && {
      key: "storm",
      d: Number(p.stormDiameterMm ?? 450),
      x: 0.55,
      depth: 2.4,
      color: "#0f766e",
    },
    p.sanitarySewer && {
      key: "sanitary",
      d: 250,
      x: 0.65,
      depth: 3.0,
      color: "#92400e",
    },
  ].filter(Boolean) as {
    key: "watermain" | "storm" | "sanitary";
    d: number;
    x: number;
    depth: number;
    color: string;
  }[];

  let x = 0;
  const pickedStrip = picked === null ? null : strips[picked];

  return (
    <figure className="space-y-1">
      <figcaption className="text-xs font-semibold">{t("title")}</figcaption>
      <svg
        viewBox={`0 0 ${W} 90`}
        className="w-full rounded border bg-[#f5efe6]"
        role="img"
        aria-label={t("label", { width: total.toFixed(1) })}
      >
        <rect x={0} y={0} width={W} height={surfaceY} fill="#e8f1fb" />
        {strips.map((s, i) => {
          const w = s.widthM * scale;
          const el = (
            <rect
              key={i}
              x={x}
              y={
                s.key === "curb"
                  ? surfaceY - 4
                  : s.key === "sidewalk" || s.key === "boulevard"
                    ? surfaceY - 2
                    : surfaceY
              }
              width={Math.max(w, 1)}
              height={8}
              fill={s.fill}
              stroke={picked === i ? "#e85e00" : "none"}
              strokeWidth={1.5}
              className="cursor-pointer"
              onMouseEnter={() => setPicked(i)}
              onClick={() => setPicked(i)}
            >
              <title>{`${t(`parts.${s.key}`)}: ${s.widthM.toFixed(1)} m`}</title>
            </rect>
          );
          x += w;
          return el;
        })}
        {strips.map((s, i) =>
          s.key === "lane" && i > 0 && strips[i - 1]!.key === "lane" ? (
            <line
              key={`m${i}`}
              x1={strips.slice(0, i).reduce((a, b) => a + b.widthM, 0) * scale}
              x2={strips.slice(0, i).reduce((a, b) => a + b.widthM, 0) * scale}
              y1={surfaceY}
              y2={surfaceY + 2}
              stroke="#fff"
              strokeWidth={1}
            />
          ) : null,
        )}
        {pipes.map((pp) => (
          <circle
            key={pp.key}
            cx={pp.x * W}
            cy={surfaceY + 8 + pp.depth * 14}
            r={Math.max(3, (pp.d / 1000) * 14)}
            fill="none"
            stroke={pp.color}
            strokeWidth={2}
          >
            <title>{`${t(`pipes.${pp.key}`)} ${pp.d} mm`}</title>
          </circle>
        ))}
      </svg>
      <p className="text-[11px] text-muted-foreground figures">
        {pickedStrip
          ? `${t(`parts.${pickedStrip.key}`)}: ${pickedStrip.widthM.toFixed(1)} m`
          : t("total", {
              width: total.toFixed(1),
              road: r.carriagewayM.toFixed(1),
            })}
      </p>
    </figure>
  );
}
