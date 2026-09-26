# PERSON_A.md — Map, design & visuals

**Role:** everything the user sees and draws: app scaffold and layout, the map and freeform design tools, live measurements, procedural 2D rendering, starting-layout generation, site context on the map, 3D views and cross-sections, and the landing page.
**Owns:** see `TEAM.md` section 2. **Contracts you provide:** `measure.ts`, `designSlice.ts`, `store.ts`, the selection contract (TEAM.md section 3).
Task ids match `PROGRESS.md`; task details are in `SPEC.md`.

## Current state

- **Current task:** P1.7
- **Status:** not started   <!-- not started | in progress | blocked | at sync point -->
- **Next action:** P1.7 editing (move, rotate, scale, vertex edit, holes, duplicate, mirror, delete). Likely Terra Draw's select mode: load the selected component's shapes into Terra Draw for editing, write back on `finish` with one `setComponentGeometry` per drag.
- **Blockers / needs from B:** none.
- **Last updated:** 2026-09-26 (P1.5 merged to `main`)

## Handoff notes

> Where an unfinished task stopped, gotchas, things to verify. Replace each session.

- Next.js is **16.3** (Middleware is now `src/proxy.ts`; read `node_modules/next/dist/docs/` before using Next APIs, see `AGENTS.md`).
- `pnpm typecheck` runs `next typegen` first (needed for the global `PageProps` / `LayoutProps` types).
- i18n lives in `src/lib/i18n/` (`routing.ts`, `navigation.ts`, `request.ts`); use `Link`/`useRouter` from `@/lib/i18n/navigation`, not `next/link`. Messages are typed from `messages/en.json` (`src/global.d.ts`).
- Dark mode follows the OS; a `.dark` / `.light` class on `<html>` forces it. Map colours are tokens: `water`, `park`, `pavement`, `building`, `warning`, `sample`. Use the `figures` utility for tabular numerals.
- Store (P1.3): `designSlice` holds `components: Component[]` (full objects, params included) and `areaBoundary`, plus selection, undo/redo (`past`/`future` snapshots of `{components, areaBoundary}`, cap 100). Every design action goes through `commit()`, which records history and drops a selection that no longer exists. `addComponents` = one undo step (build list / generated layout). `setComponentGeometry(id, g, origin?)` marks drawn; default origin `user`, the generator passes `generated`. `duplicateComponent(id, name?)` offsets 25 m E/S, new section/feature ids, selects the copy; the UI passes the translated name. `loadDesign()` replaces everything and clears history (for project files).
- Component list (P1.4): docked left of the map on desktop, under it on mobile. Row actions (zoom to, hide/show, ⋯ menu with rename/duplicate/delete) show on hover/focus, always on touch. Double-click a name to rename. Undo/redo buttons in the list header plus Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y (ignored while typing). Key measurement and P50/share per row come later (P1.15 and B's P3.11).
- Temporary: the empty list has a "Load sample project (Northgate)" button that loads B's fixture into the store (design part only). Remove or move it once the landing page's demo cards (P4.5) exist.
- `component-layers.tsx` is a plain placeholder rendering (fills, lines ~10 m wide at street zoom, circles for points, orange selection outline, dashed project area) and click-to-select. P1.11–P1.13 replace the styling; keep the `componentId` property and click handling. Layers are re-added on `style.load` after a basemap switch. MapLibre can't parse oklch, so map colours are hex in `src/lib/render/colors.ts`.
- Radix menu gotcha: when a menu item opens an input, prevent `onCloseAutoFocus` and focus the input there (see rename in `component-list.tsx`). Focus lands after the menu's close animation.
- Drawing (P1.5): the toolbar under the search box picks what to draw (new road/park/building/structure with a starting subtype, project area, the selected planned component, or a section on the selected building), then a shape tool limited to what that target allows (`toolsForTarget` in `src/lib/geo/drawing.ts`). `drawing` in the store drives Terra Draw (`draw-controller.tsx`); on finish the shape goes through `finishDrawing` (one undo step, selects the component) and is removed from Terra Draw. Terra Draw is recreated on `style.load` after a basemap switch; component layers are inserted below its `td-*` layers. The click that finishes a shape is ignored by click-to-select (`justFinishedDrawing`).
- Park features and custom elements are supported by `finishDrawing` (`kind: "feature"`) but have no toolbar entry yet: the feature palette and "Custom…" come with the Add menu (P1.6).
- New buildings start with 1 storey and a flat roof (`DEFAULT_STOREYS`); P1.8 adds the storeys/roof controls, P1.9 smart-start sizes.
- **Deferred checks (per the human, 2026-09-26):** don't spend time verifying mobile layout or French text while building features. Only English on desktop is checked for now; mobile is covered in P10.3 and French in P10.1. Known unchecked: the draw toolbar and component list at phone width, and French labels' length in the toolbar.
- For live drags (P1.7), call `setComponentGeometry` only on drag end so each drag is one undo step.
- MapLibre 6: its CSS sets `position: relative` on the container, so size it with `h-full w-full`, not `absolute inset-0`. The worker must be served from `/maplibre/` (see `setWorkerUrl` in `map-view.tsx`).
- Commits: plain `P1.3 [A]: …` messages under the user's name, **no Co-Authored-By trailer**.
- Visual checks: no Chrome on this Mac. Use Playwright Chromium (already downloaded to `~/Library/Caches/ms-playwright`): in a scratch folder `pnpm add playwright`, then a script that opens `http://localhost:3123/en/workspace` (after `pnpm build && pnpm start -p 3123`) with launch args `--use-angle=swiftshader --enable-unsafe-swiftshader` and takes a screenshot.
- `TopBar` accepts `children` for workspace actions (New project, Download project file) to be added later.
- Browser test tips: `pnpm dev -p 3123` is fine for quick checks. At a 1440 px window the map canvas is only ~560 px wide (list + estimate panel take the rest), so keep test clicks inside it. After choosing a menu item that opens an input, wait for the input to have focus before typing. Past test scripts are in the session scratchpad only, not the repo.
- Open requests from B (see `PERSON_B.md`, both "not needed before S3"): `updateComponents(patches)` as one undo step in `designSlice`, and a toggleable zoning map layer from `project.zoningContext` (schema coming in B's Z.1). B's `projectSlice` (B.2) is now on `main`.

## Requests to Person B

- B.2: component params/paramMeta/overrides live on the components in `designSlice`. Edit them with `updateComponent(id, { params, paramMeta, overrides })` so they share undo history; keep project meta, settings, and scenarios in `projectSlice`. Opening a project file should call `loadDesign({ components, areaBoundary })`.

---

## Task list (in order)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` dropped. **Core** = needed for the demo. **Stretch** = drop first if behind.

### Before S1 (first hour) — Foundation · Core
- [x] P0.1 Scaffold Next.js (App Router) + TypeScript strict + pnpm
- [x] P0.2 Tailwind + shadcn/ui + Public Sans + design tokens (light/dark)
- [x] P0.3 next-intl with `/en` and `/fr` routing, `messages/en.json`, `messages/fr.json`
- [x] P0.4 Zustand, zod, Vitest, ESLint, Prettier; scripts `typecheck`, `lint`, `test`
- [x] P0.6 App layout shell (top bar, language toggle, sample-data badge)
- [x] P0.7 `.env.example`, `README.md`, `DEPLOY.md`
- [x] P0.8 Deploy placeholder to Vercel (record URL below)
- [x] A.1 Create `src/lib/store/store.ts` with `designSlice.ts` (selection contract included) and an empty `projectSlice.ts` stub for B; merge to `main` **as early as possible** so B can build on it

### S1 → S2 — Map & drawing · Core
- [x] P1.1 Workspace page with MapLibre, basemap (MapTiler, OpenFreeMap fallback), controls
- [x] P1.2 Geocoding search with fly-to
- [x] P1.3 Store: multiple components (planned/drawn, user/generated), selection, undo/redo
- [x] P1.4 Component list panel (select, zoom to, rename, duplicate, hide/show, delete)
- [x] P1.5 Freeform draw tools: polygon, rectangle, circle/ellipse, freehand, line/polyline, point; project area
- [ ] P1.7 Editing: move, rotate, scale, vertex edit, holes, duplicate, mirror, delete
- [ ] P1.8 Multi-section buildings: split/merge sections, per-section storeys and roof
- [ ] P1.14 `measure.ts` (Turf) + unit tests; per-component, per-section, and project totals — **merge early, B's engine depends on it**
- [ ] P1.15 Live measurement labels + measurements panel + metric/imperial toggle
- [ ] P1.6 Add menu incl. "Custom…" elements and custom park features (name + shape; the pricing choice form is B's `CustomPricingForm` — mount a placeholder until it exists)

### S2 → S3 — Rendering, layout & estimate on the map · Core
- [ ] P1.13 Roads along any path at true width with markings, curbs, sidewalks, cycle lanes
- [ ] P1.11 Procedural 2D rendering: roofs from actual section shapes, height shading, storeys badges, original SVG icon set
- [ ] P1.12 Procedural park rendering: grass fill, seeded tree scatter, fitted field markings, parking stalls, custom feature hatch
- [ ] P1.9 `src/data/typologies.json` (you own this one data file) + smart-start shape for a known type
- [ ] P1.10 Generate starting layout (seeded): roads → buildings fronting roads → parks; spatial hints; no overlaps; Regenerate
- [ ] P3.2 Workspace layout: view (left) + B's `<EstimatePanel/>` (right); view switcher 2D plan / 3D map
- [ ] P3.3 Shared selection across views, component list, and line items; hover tooltips with cost (from `useEstimate`, fixture until live)
- [ ] P3.4 "Colour by cost" toggle on map views
- [ ] P3.9a Flag markers on the map (B owns the flags list)
- [ ] P7.4 Creation flow navigation: Describe → Review build list (B's screen) → Locate → Draw each planned component (checklist) → Questions (B's panel) → Estimate
- [ ] P4.5 Landing page: prompt box (calls B's parse), blank map option, demo cards, open project file button (B's loader)
- [ ] P4.3 Unsaved-changes `beforeunload` warning; "New project" reset

### S3 → S4 — 3D and context
- [ ] P1.18 3D map view: every building section extruded to its own height · Core
- [ ] P1.16 Advisory cross-component warnings (overlaps, outside park/area, unusual values) · Core
- [ ] P1.17 `/api/geo/snap` (OSRM, cache, timeout) + "Snap to streets" with fallback · Stretch
- [ ] P5.1 Map snapshot capture helper for B's PDF export · Core
- [ ] P6.1 `/api/geo/context` (Overpass) with cache/timeout/fallback · Stretch
- [ ] P6.2 Site tab + map overlays with buffer rings · Stretch
- [ ] P9.1 Road cross-section SVG per road, opens on selection, clickable · Stretch
- [ ] P9.2 3D site scene in the view switcher; positioned from map coordinates; shared selection · Stretch
- [ ] P9.3 3D elements: buildings · Stretch
- [ ] P9.4 3D elements: parks, roads with buried pipes, structures · Stretch
- [ ] P9.5 Colour by cost + cost tooltips in 3D site · Stretch

### S4 → S5 — Polish (after feature freeze)
- [ ] P10.2 Accessibility pass (your areas)
- [ ] P10.3 Mobile layout
- [ ] P10.5 Performance check (map, rendering, 3D)
- [ ] P10.8 Final deploy
- [ ] P10.7 Rehearse demo walkthrough with B (SPEC section 23); record video together

---

## Depends on Person B

- Schemas and fixtures (S1) — build against `src/lib/fixtures/*.json` until the live engine is wired.
- `useEstimate()` and `<EstimatePanel/>` (S2–S3).
- Parse endpoint + build list screen, Questions panel, project file loader, `CustomPricingForm` (S3).

## Feature map (your files)

| Feature | Key files | Notes |
| --- | --- | --- |
| i18n routing | `src/lib/i18n/*`, `src/proxy.ts`, `messages/*.json` | locales `en`, `fr`; `intlLocale` maps to `en-CA`/`fr-CA` |
| Layout shell | `src/app/[locale]/layout.tsx`, `src/components/layout/*` | top bar, sample-data badge, language toggle |
| Design tokens | `src/app/globals.css` | light/dark, map colours, `figures` utility |
| Store | `src/lib/store/store.ts`, `designSlice.ts` (+ test), `projectSlice.ts` (B's stub) | selection contract; components, project area, undo/redo, duplicate |
| Geometry transforms | `src/lib/geo/transform.ts`, `bounds.ts` (+ test) | `translateFeature` in metres (duplicate offset); `featureBounds` / `componentBounds` for zoom to |
| Component list | `src/components/map/component-list.tsx` | select, zoom to, rename, duplicate, hide/show, delete, undo/redo buttons + shortcuts, sample loader |
| Component map layers | `src/components/map/component-layers.tsx`, `src/lib/render/colors.ts` | placeholder styling until P1.11; click to select; selection highlight |
| Drawing | `src/lib/geo/drawing.ts` (targets, tools per type, geometry from a shape), `src/components/map/draw-controller.tsx` (Terra Draw), `draw-toolbar.tsx`; store `drawing`, `startDrawing`, `cancelDrawing`, `finishDrawing` | Terra Draw 1.35 + MapLibre adapter; self-crossing polygons rejected |
| UI primitives | `src/components/ui/button.tsx`, `dropdown-menu.tsx` (shadcn) | |
| Pages | `src/app/[locale]/page.tsx` (landing placeholder), `src/app/[locale]/workspace/page.tsx` | |
| Place search | `src/components/map/geocoder.tsx`, `src/lib/geo/geocode.ts` (+ test) | MapTiler search-as-you-type (Canada, current language); Photon (OSM) without a key; suggestions as you type from 2 characters; 6 s timeout |
| Map | `src/components/map/map-view.tsx`, `map-context.tsx` (`useMap()`), `basemap-toggle.tsx`, `workspace-shell.tsx`; `src/lib/geo/basemaps.ts` | MapTiler streets/hybrid, OpenFreeMap positron without key; worker copied to `public/maplibre` by `pnpm copy:maplibre` (runs in dev/build) |

## Environment

- **Vercel URL:** https://publicworkscost.vercel.app (dashboard: https://vercel.com/hackathon-aqeeljawed/publicworkscost)
- **Env vars configured in Vercel:** `NEXT_PUBLIC_MAPTILER_KEY` (verified live 2026-09-26: MapTiler streets, satellite, search). Still to add before P7: `GEMINI_API_KEY`, `AI_PROVIDER`.
