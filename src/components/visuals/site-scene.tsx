"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEstimate } from "@/lib/estimate/useEstimate";
import { componentBounds } from "@/lib/geo/bounds";
import { localFrame } from "@/lib/geo/transform";
import { intlLocale, type Locale } from "@/lib/i18n/routing";
import { parkFeatures } from "@/data";
import { componentColor } from "@/lib/render/colors";
import { buildPlan, roadProfile } from "@/lib/render/plan";
import type { Component, Position } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// 3D site scene (P9.2–P9.5): every component positioned from its map coordinates
// in local metres. Buildings are extruded per section with floor lines, roads are
// ribbons at true width with buried pipes shown under them, parks get lawns,
// features and trees. Click to select (shared selection), hover for cost, and
// Colour by cost recolours everything. Component and feature names float above them.
// Flat layers sit a few cm apart; the logarithmic depth buffer keeps them from
// flickering (z-fighting) at a distance.

const DEFAULT_FLOOR_M = 4;
/** Feature tags (parking, playground…) hide beyond this camera distance. */
const MINOR_LABEL_MAX_M = 900;
/** Heights (m) of the flat layers, bottom to top. */
const Y = { site: 0.05, lawn: 0.1, roadBase: 0.15, road: 0.2, feature: 0.3 };
const COST_RAMP = ["#fde68a", "#fbbf24", "#f97316", "#dc2626", "#7f1d1d"];

type XY = [number, number];

function centreOf(components: Component[]): Position | null {
  const boxes = components
    .map(componentBounds)
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (!boxes.length) return null;
  return [
    (Math.min(...boxes.map((b) => b[0])) +
      Math.max(...boxes.map((b) => b[2]))) /
      2,
    (Math.min(...boxes.map((b) => b[1])) +
      Math.max(...boxes.map((b) => b[3]))) /
      2,
  ];
}

/** A THREE.Shape from a polygon's rings (x east, y north); holes included. */
function shapeOf(
  rings: Position[][],
  toLocal: (p: Position) => XY,
): THREE.Shape {
  const [outer, ...holes] = rings;
  const shape = new THREE.Shape(
    outer!.map((p) => new THREE.Vector2(...toLocal(p))),
  );
  for (const h of holes)
    shape.holes.push(
      new THREE.Path(h.map((p) => new THREE.Vector2(...toLocal(p)))),
    );
  return shape;
}

/** A flat ribbon along a path, `width` metres wide, at height `y`. */
function ribbon(points: XY[], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const half = width / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[i + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = (-(z1 - z0) / len) * half;
    const nz = ((x1 - x0) / len) * half;
    const a = [x0 + nx, y, -(z0 + nz)];
    const b = [x0 - nx, y, -(z0 - nz)];
    const c = [x1 + nx, y, -(z1 + nz)];
    const d = [x1 - nx, y, -(z1 - nz)];
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A component name shown above a point in the scene. */
type SceneLabel = {
  componentId: string;
  name: string;
  at: THREE.Vector3;
  /** Features (parking, playground…) get a smaller tag. */
  minor?: boolean;
};

/** Centre of a feature's bounding box. */
function centreOfCoords(coords: Position[]): Position {
  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}
const coordsOf = (g: { type: string; coordinates: unknown }): Position[] =>
  g.type === "Polygon"
    ? (g.coordinates as Position[][])[0]!
    : g.type === "LineString"
      ? (g.coordinates as Position[])
      : [g.coordinates as Position];

function buildScene(
  components: Component[],
  centre: Position,
  colorFor: (c: Component) => string,
): { group: THREE.Group; radius: number; labels: SceneLabel[] } {
  const { toLocal } = localFrame(centre);
  const group = new THREE.Group();
  const labels: SceneLabel[] = [];
  let radius = 100;
  const tag = (o: THREE.Object3D, c: Component) => {
    o.userData.componentId = c.id;
    return o;
  };
  // Shapes live in the x/y plane; rotate to lie on the ground (y up, north = -z).
  const flat = (geom: THREE.BufferGeometry, y: number) => {
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, y, 0);
    return geom;
  };

  for (const c of components) {
    if (!c.visible || !c.geometry) continue;
    const g = c.geometry;
    const color = colorFor(c);
    for (const p of [
      g.primary,
      ...(g.sections ?? []).map((s) => s.footprint),
    ]) {
      const coords =
        p.geometry.type === "Polygon"
          ? p.geometry.coordinates[0]!
          : p.geometry.type === "LineString"
            ? p.geometry.coordinates
            : [p.geometry.coordinates];
      for (const q of coords)
        radius = Math.max(radius, Math.hypot(...toLocal(q)));
    }

    // Name tags: above the tallest section for buildings, just above the ground otherwise.
    {
      const top = Math.max(
        0,
        ...(g.sections ?? []).map(
          (s) => s.storeys * (s.floorHeightM ?? DEFAULT_FLOOR_M),
        ),
      );
      const pc = g.primary.geometry;
      const [x, y] = toLocal(
        pc.type === "LineString"
          ? (pc.coordinates[Math.floor(pc.coordinates.length / 2)] as Position)
          : centreOfCoords(coordsOf(pc)),
      );
      labels.push({
        componentId: c.id,
        name: c.name,
        // Buildings: just above the roof. Others: above the trees, clear of feature tags.
        at: new THREE.Vector3(x, c.type === "building" ? top + 4 : 16, -y),
      });
      for (const f of g.features) {
        const [fx, fy] = toLocal(centreOfCoords(coordsOf(f.geometry.geometry)));
        labels.push({
          componentId: c.id,
          // Catalog labels carry the pricing unit, e.g. "Parking area (per m²)".
          name:
            f.customLabel ??
            parkFeatures.features[f.kind]?.label.en.replace(
              /\s*\(per [^)]*\)$/,
              "",
            ) ??
            f.kind,
          at: new THREE.Vector3(fx, 2, -fy),
          minor: true,
        });
      }
    }

    if (c.type === "road" && g.primary.geometry.type === "LineString") {
      const pts = g.primary.geometry.coordinates.map(toLocal);
      const r = roadProfile(c);
      group.add(
        tag(
          new THREE.Mesh(
            ribbon(pts, r.totalM, Y.roadBase),
            new THREE.MeshLambertMaterial({ color: "#d4d4d8" }),
          ),
          c,
        ),
      );
      group.add(
        tag(
          new THREE.Mesh(
            ribbon(pts, r.carriagewayM, Y.road),
            new THREE.MeshLambertMaterial({ color }),
          ),
          c,
        ),
      );
      // Buried pipes under the road (watermain, storm, sanitary).
      const pipes = [
        ["#2563eb", -1.8, -2],
        ["#0f766e", -2.4, 0],
        ["#92400e", -3, 2],
      ] as const;
      for (const [pc, depth, off] of pipes) {
        const path = new THREE.CatmullRomCurve3(
          pts.map(([x, y]) => new THREE.Vector3(x + off, depth, -y)),
          false,
          "catmullrom",
          0,
        );
        group.add(
          tag(
            new THREE.Mesh(
              new THREE.TubeGeometry(path, Math.max(8, pts.length * 4), 0.3, 6),
              new THREE.MeshLambertMaterial({
                color: pc,
                transparent: true,
                opacity: 0.8,
              }),
            ),
            c,
          ),
        );
      }
      continue;
    }

    if (c.type === "building" && g.sections?.length) {
      if (g.primary.geometry.type === "Polygon") {
        group.add(
          tag(
            new THREE.Mesh(
              flat(
                new THREE.ShapeGeometry(
                  shapeOf(g.primary.geometry.coordinates, toLocal),
                ),
                Y.site,
              ),
              new THREE.MeshLambertMaterial({ color: "#e7e0d6" }),
            ),
            c,
          ),
        );
      }
      for (const s of g.sections) {
        const h = s.storeys * (s.floorHeightM ?? DEFAULT_FLOOR_M);
        const shape = shapeOf(s.footprint.geometry.coordinates, toLocal);
        const geom = flat(
          new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }),
          0,
        );
        // Extruded along +z, which points up after `flat`'s rotation.
        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshLambertMaterial({
            color:
              s.roof === "green" && !color.startsWith("#f") ? "#7fb069" : color,
          }),
        );
        group.add(tag(mesh, c));
        group.add(
          tag(
            new THREE.LineSegments(
              new THREE.EdgesGeometry(geom, 30),
              new THREE.LineBasicMaterial({ color: "#3b2f27" }),
            ),
            c,
          ),
        );
        // Floor lines.
        for (let f = 1; f < s.storeys; f++) {
          const pts = s.footprint.geometry.coordinates[0]!.map((p) => {
            const [x, y] = toLocal(p);
            return new THREE.Vector3(
              x,
              f * (s.floorHeightM ?? DEFAULT_FLOOR_M),
              -y,
            );
          });
          group.add(
            tag(
              new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({
                  color: "#5c4a3d",
                  transparent: true,
                  opacity: 0.5,
                }),
              ),
              c,
            ),
          );
        }
      }
      continue;
    }

    if (g.primary.geometry.type === "Polygon") {
      const lawn = c.type === "park" ? "#a6d67c" : color;
      group.add(
        tag(
          new THREE.Mesh(
            flat(
              new THREE.ShapeGeometry(
                shapeOf(g.primary.geometry.coordinates, toLocal),
              ),
              Y.lawn,
            ),
            new THREE.MeshLambertMaterial({
              color: color === componentColor[c.type] ? lawn : color,
            }),
          ),
          c,
        ),
      );
    }
    if (g.primary.geometry.type === "Point") {
      const [x, y] = toLocal(g.primary.geometry.coordinates);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 3, 3, 16),
        new THREE.MeshLambertMaterial({ color }),
      );
      m.position.set(x, 1.5, -y);
      group.add(tag(m, c));
    }
  }

  // Park features and trees from the plan generator (same seeded scatter as 2D).
  const trunk = new THREE.CylinderGeometry(0.25, 0.3, 2, 6);
  const crown = new THREE.ConeGeometry(1, 1, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: "#6b4f2a" });
  const crownMat = new THREE.MeshLambertMaterial({ color: "#3f7d3a" });
  let featureIndex = 0;
  for (const f of buildPlan(components)) {
    const c = components.find((x) => x.id === f.properties.componentId);
    if (!c) continue;
    if (f.properties.layer === "tree" && f.geometry.type === "Point") {
      const [x, y] = toLocal(f.geometry.coordinates as Position);
      const r = Number(f.properties.radiusM) || 3;
      const t = new THREE.Mesh(trunk, trunkMat);
      t.position.set(x, 1, -y);
      const k = new THREE.Mesh(crown, crownMat);
      k.scale.set(r, r * 2, r);
      k.position.set(x, 2 + r, -y);
      group.add(tag(t, c), tag(k, c));
    }
    if (
      (f.properties.layer === "feature" ||
        f.properties.layer === "feature-custom") &&
      f.geometry.type === "Polygon"
    ) {
      const mat = new THREE.MeshLambertMaterial({
        color: String(f.properties.color ?? "#d9d4c7"),
      });
      group.add(
        tag(
          new THREE.Mesh(
            flat(
              new THREE.ShapeGeometry(
                shapeOf(f.geometry.coordinates as Position[][], toLocal),
              ),
              // Overlapping features each get their own height.
              Y.feature + 0.02 * (featureIndex++ % 10),
            ),
            mat,
          ),
          c,
        ),
      );
    }
  }
  return { group, radius, labels };
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

export function SiteScene() {
  const t = useTranslations("visuals.site");
  const locale = intlLocale[useLocale() as Locale];
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    content: THREE.Group | null;
    labels: { at: THREE.Vector3; el: HTMLElement; minor?: boolean }[];
    centreKey: string;
  } | null>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const components = useStore((s) => s.components);
  const selectedId = useStore((s) => s.selectedComponentId);
  const colourByCost = useStore((s) => s.colourByCost);
  const { estimate } = useEstimate();
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const cost = useMemo(
    () => new Map((estimate?.components ?? []).map((c) => [c.componentId, c])),
    [estimate],
  );
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "CAD",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale],
  );

  // Set up renderer, camera, controls, lights once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2f6");
    scene.add(new THREE.HemisphereLight("#ffffff", "#b9b4a8", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(200, 400, 150);
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3000, 48),
      new THREE.MeshLambertMaterial({
        color: "#f3efe7",
        transparent: true,
        opacity: 0.85,
      }),
    );
    ground.rotateX(-Math.PI / 2);
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(
      45,
      el.clientWidth / el.clientHeight,
      1,
      20000,
    );
    camera.position.set(250, 250, 250);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    three.current = {
      scene,
      camera,
      renderer,
      controls,
      content: null,
      labels: [],
      centreKey: "",
    };
    let frame = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      // Keep building names over their roofs.
      for (const l of three.current?.labels ?? []) {
        v.copy(l.at).project(camera);
        const visible =
          v.z < 1 &&
          Math.abs(v.x) < 1.1 &&
          Math.abs(v.y) < 1.1 &&
          // Feature tags only when close enough to read them without clutter.
          (!l.minor || camera.position.distanceTo(l.at) < MINOR_LABEL_MAX_M);
        l.el.style.display = visible ? "" : "none";
        if (visible)
          l.el.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(loop);
    };
    loop();
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // Rebuild the content when the design, selection or colours change.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    const centre = centreOf(components);
    if (ctx.content) {
      ctx.scene.remove(ctx.content);
      disposeGroup(ctx.content);
      ctx.content = null;
    }
    ctx.labels = [];
    labelLayer.current?.replaceChildren();
    if (!centre) return;
    const maxShare = Math.max(0, ...[...cost.values()].map((c) => c.share));
    const colorFor = (c: Component) => {
      if (c.id === selectedId) return "#e85e00";
      if (colourByCost) {
        const share = cost.get(c.id)?.share ?? 0;
        return COST_RAMP[
          Math.min(4, Math.floor((maxShare ? share / maxShare : 0) * 4 + 0.5))
        ]!;
      }
      return c.type === "road" ? "#51565e" : componentColor[c.type];
    };
    const { group, radius, labels } = buildScene(components, centre, colorFor);
    ctx.scene.add(group);
    ctx.content = group;
    for (const l of labels) {
      const el = document.createElement("div");
      el.textContent = l.name;
      el.className = `absolute top-0 left-0 max-w-40 truncate rounded shadow-sm ${
        l.minor
          ? "bg-card/75 px-1 py-px text-[10px] text-muted-foreground"
          : "z-10 px-1.5 py-0.5 text-xs font-medium"
      } ${
        l.minor
          ? ""
          : l.componentId === selectedId
            ? "bg-primary text-primary-foreground"
            : "bg-card/90 text-foreground"
      }`;
      labelLayer.current?.appendChild(el);
      ctx.labels.push({ at: l.at, el, minor: l.minor });
    }
    // Frame the project the first time (or when it moves elsewhere).
    const key = centre.map((v) => v.toFixed(3)).join(",");
    if (key !== ctx.centreKey) {
      ctx.centreKey = key;
      const d = Math.max(150, radius * 1.6);
      ctx.camera.position.set(d * 0.7, d * 0.8, d * 0.9);
      ctx.controls.target.set(0, 0, 0);
    }
  }, [components, selectedId, colourByCost, cost]);

  // Click to select, hover for cost.
  useEffect(() => {
    const ctx = three.current;
    const el = host.current;
    if (!ctx || !el) return;
    const ray = new THREE.Raycaster();
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, ctx.camera);
      const hit = ctx.content
        ? ray
            .intersectObjects(ctx.content.children, false)
            .find((h) => h.object.userData.componentId)
        : undefined;
      return {
        id: hit?.object.userData.componentId as string | undefined,
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      };
    };
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      useStore.getState().selectComponent(pick(e).id ?? null);
    };
    const onMove = (e: PointerEvent) => {
      const { id, x, y } = pick(e);
      const c = id && useStore.getState().components.find((k) => k.id === id);
      if (!c) return setHover(null);
      const info = cost.get(c.id);
      setHover({
        x,
        y,
        text: info
          ? `${c.name} · ${money.format(info.p50)} · ${Math.round(info.share * 100)}%`
          : c.name,
      });
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", () => setHover(null));
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
    };
  }, [cost, money]);

  return (
    <div className="absolute inset-0 z-20">
      <div
        ref={host}
        className="h-full w-full"
        aria-label={t("label")}
        role="img"
      />
      <div
        ref={labelLayer}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
      {hover && (
        <div
          className="pointer-events-none absolute rounded bg-card px-2 py-1 text-xs figures shadow"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      )}
      {!components.some((c) => c.geometry) && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}
      <p className="absolute bottom-2 left-2 rounded bg-card/80 px-2 py-1 text-[11px] text-muted-foreground">
        {t("hint")}
      </p>
    </div>
  );
}
