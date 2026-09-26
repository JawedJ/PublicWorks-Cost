# PERSON_A.md — Map, design & visuals

**Role:** everything the user sees and draws: app scaffold and layout, the map and freeform design tools, live measurements, procedural 2D rendering, starting-layout generation, site context on the map, 3D views and cross-sections, and the landing page.
**Owns:** see `TEAM.md` section 2. **Contracts you provide:** `measure.ts`, `designSlice.ts`, `store.ts`, the selection contract (TEAM.md section 3).
Task ids match `PROGRESS.md`; task details are in `SPEC.md`.

## Current state

- **Current task:** none in progress; all my Core and Stretch tasks through S4 are merged, plus P7.4
- **Status:** at sync point   <!-- not started | in progress | blocked | at sync point -->
- **Next action:** Demo projects (P4.4: draw three in the app, download project files for B; waiting on the human to pick them). Then P10 polish (needs the human's go-ahead).
- **Blockers / needs from B:** see Requests below.
- **Last updated:** 2026-09-26 (auto project area for layouts, open-space preference; map toggles white/black, flag numbers removed, title-case names; Add picker reworked; compact PDF assumptions, capitalized names, single OSM credit; map highlights for things to check; demolition of existing buildings + better questions; map-aware starting layout; build list tags removable with ×; sample-data badge removed from the top bar; P6.3 site context in the engine, automatic lookup; rotate/tilt mode; P7.4 creation flow with Gemini parse + review; P50/share in the component list; project file buttons in the top bar; language toggle removed; park features from the prompt placed with the park; workspace height fix; UI tweaks: resizable side panels, narrower estimate panel, building names in 3D; P1.7–P1.18, P3.2–P3.4, P3.9a, P4.3, P4.5, P5.1, P6.1–P6.2, P9.1–P9.5 merged to `main`)

## Handoff notes

> Where an unfinished task stopped, gotchas, things to verify. Replace each session.

- Layout rough edge: a big park in a dense downtown finds no open land and falls back to the plain grid at the centre (then gets priced demolition). Could prefer the spot with least overlap.
- Layout: `generateLayout(components, centre, seed, surroundings?, boundary?)`; `readSurroundings(map, centre)` (`src/components/map/read-surroundings.ts`) jumps to zoom 15 at the centre and waits for tiles (≤4 s). Rough edges: in dense downtowns plots land in whatever open lots exist, so a project can spread out; tile-clipped building fragments are treated as separate obstacles (fine); satellite (hybrid) style may lack buildings.

- **Pace (per the human, 2026-09-26):** fast MVP. Batch tasks, verify main functionality only (checks + one smoke screenshot), log rough edges here instead of polishing.
- Editing (P1.7): selected component's shapes are copied into Terra Draw select mode (`draw-controller.tsx`, ids `<componentId>|p|s|f`). Only outlines go to Terra Draw (it rejects holes); `withElementShape` puts holes back. Clicks on shapes are picked by `pickElement` (Terra Draw's own click selection is off). Move/rotate/scale of the whole component are MapLibre markers (`transform-handles.tsx`) with live preview (`previewComponentGeometry` + `endGeometryPreview` = one undo step). Known rough edges: rotated shapes scale in the axis-aligned frame; Terra Draw's grab distance is its 40 px default (grabs corners on small shapes); the Terra Draw overlay fill covers holes.
- Zoning map layer: `zoning-layer.tsx` (mounted in `workspace-shell.tsx` inside MapView), store `showZoning`, toggle in `view-switcher.tsx` (toggles now stacked under the view radio). Fetches `/api/zoning/map` for the capped viewport on `moveend` (300 ms debounce), layers `pw-zoning-fill/line` inserted below the first `plan-|pw-|td-` layer, re-added on `style.load`, removed when off. Click → code in the legend card.
- B's small requests done: local streets in `/api/geo/context` (site features and roads output separately, caps 300/600); `near_waterway` flag skipped when the template raises `in_water_permit` (site cost line kept).
- Parking lot component (per the human): `ComponentType` gained `parking`; engine template `src/engine/templates/parking.ts` (+ `parking.test.ts`); SOFT costs, overrun → road reference (`overrunEntry`), evidence tags, colours, icon (SquareParking), Add menu, typologies (`parking.surface_lot` 1,500 m²; stalls × 30 m² when given), 2D plan (drawn like a parking feature with stalls), overlap warnings. Building `parkingStalls` subtype defaults removed (B's building.ts + tests updated). Parse: AI rule + keyword rule (before parks; `underground parking` stays basement).
- Estimate class (B's `componentClass` in `src/engine/index.ts`, per the human): boolean inputs always count as answered; test in `estimate.test.ts`.
- Building amenity defaults (B's `building.ts`, per the human): all amenities off unless specified; test in `building.test.ts`.
- Estimate/Inputs tabs (B's files, per the human): improvement hints removed from the Estimate tab; "Use default" buttons removed from Inputs. Building amenities in the prompt → params on that building: rule added to `SYSTEM` in `src/lib/ai/parse.ts` (B's) and `AMENITIES` in `keyword-parse.ts` (attach to the building just before; reset after a non-building).
- P7.4 Questions step: `estimate-panel.tsx` (B's file) switches to the Questions tab once when the planned count drops to 0 (render-time state adjust, no effect). Seen: questions requested twice right after layout (site context arriving ~2 s later changes the estimate); harmless, B's call whether to debounce.
- P7.4: landing `start()` → `requestParse` (spinner) → B's `<BuildListReview>` → `applyDraft` → `/workspace` with planned components; Generate layout / smart start place them. Questions step waits for B's P7.5. `keyword-parse.ts` is now only used by B's `fallbackDraft`.
- Park features from the prompt: `applyDraft` stores them as a `plannedFeatures` param ("playground,splash_pad"); `withPlannedFeatures` (`src/lib/geo/generate.ts`) drops them as squares around the park centre in `placeSmart` (planned) and `generateLayout`, only while the park has no features. Not a catalog param, so the engine ignores it.
- Rotate mode (per the human): the compass is replaced by `RotateControl` (`rotate-control.ts`, needle follows bearing). When on, `RotateOverlay` in `map-view.tsx` covers the map (drawing/selection pause) and dragging left/right turns the map, up/down tilts it (3D map only); scroll still zooms; Esc or the button exits. No reset-north button any more.
- One-screen app (per the human): `body` is `h-dvh overflow-hidden`, `main` is `min-h-0 flex-1 overflow-y-auto` (long pages like the build-list review scroll inside it). The workspace row is `lg:h-[calc(100dvh-3.5rem)] lg:flex-none` (without `flex-none` a long estimate stretched the page). Panel scroll areas must be `relative`: sr-only text inside them is absolutely positioned and otherwise escapes the scroll clip, making `main` scrollable. They also use `overscroll-contain`. Left panel scrolls as one column (sticky list header); estimate panel scrolls in its inner wrapper.
- i18n: `request.ts` merges `fr.json` over `en.json`, so missing French keys fall back to English (the fr build broke on B's `projectFile` keys).
- Top bar: `WorkspaceActions` shows B's Open/Download project file buttons on `/workspace`; the EN/FR toggle is gone (English only). Landing has Open project file next to the sample.
- Gemini: `GEMINI_API_KEY` + `AI_PROVIDER=gemini` set in `.env.local` and in Vercel (by the human, 2026-09-26). The key was pasted in chat: rotate it after the hackathon.
- UI tweaks (per the human): estimate panel defaults to 28% width; list and estimate panel resize by dragging their inner edges (`src/components/layout/resize-handle.tsx`, widths in `workspace-shell.tsx` state, not saved). (The "Add to the map" palette was removed again at the human's request; the Add menu above the map is the only way to add.) 3D site: every component gets a name tag (HTML, projected each frame; buildings above the roof, others at 16 m) and placed features a small tag (hidden beyond 900 m camera distance). Flat layers use the `Y` heights and a logarithmic depth buffer (fixed z-fighting flicker on parking lots/features).
- Touched B's files (per the human): Inputs tab hides the Default/You badges (test updated); Line items rows are stacked (description + total, then quantity/price inputs) so they fit the narrower panel. Side panels never scroll sideways (`overflow-x-hidden`).
- Section split (P1.8) not implemented; merge unions all sections (tallest wins).
- Plan rendering (P1.11–13): `src/lib/render/plan.ts` builds one GeoJSON with a `layer` property; `plan-layers.tsx` styles it under the interactive `pw-*` layers, which are transparent (`plan` property) unless Colour by cost is on. Metric widths use a zoom-exponential expression (must be the outermost expression; no `max()` around it).
- `useEstimate()` is called twice (EstimatePanel and ComponentLayers) → two engine runs per change. Fine for now; B could move the estimate into the store.
- Landing prompt uses a TEMPORARY keyword parser (`src/components/landing/keyword-parse.ts`) until B's `/api/ai/parse`; it creates planned components with size hints `gfaOverrideM2`, `storeys`, `areaM2`, `lengthM` that smart start / Generate layout read.
- 3D site (P9.2–P9.5): `src/components/visuals/site-scene.tsx`, plain three.js + OrbitControls, rebuilt on every design/selection/colour change (fine at demo scale). Pipes are drawn under every road at fixed depths (not from params yet).
- Site context (P6, reworked per the human): no button or map overlays. `SiteContextLookup` (`site-context.tsx`, mounted in `workspace-shell.tsx`) calls `/api/geo/context` 2 s after the design's bbox changes (key rounded to ~100 m); failures keep the previous result; a loaded project keeps its snapshot until it moves. The engine's `src/engine/site.ts` (P6.3, done by A per the human) adds allowance line items + flags (see SPEC change log). Overpass: overpass-api.de tried twice then private.coffee mirror (unverified); overpass.osm.ch is Swiss-only.
- `captureMapSnapshot` / `useMapSnapshot` (`src/components/map/snapshot.ts`) not yet exercised in a browser.

- Next.js is **16.3** (Middleware is now `src/proxy.ts`; read `node_modules/next/dist/docs/` before using Next APIs, see `AGENTS.md`).
- `pnpm typecheck` runs `next typegen` first (needed for the global `PageProps` / `LayoutProps` types).
- i18n lives in `src/lib/i18n/` (`routing.ts`, `navigation.ts`, `request.ts`); use `Link`/`useRouter` from `@/lib/i18n/navigation`, not `next/link`. Messages are typed from `messages/en.json` (`src/global.d.ts`).
- Dark mode follows the OS; a `.dark` / `.light` class on `<html>` forces it. Map colours are tokens: `water`, `park`, `pavement`, `building`, `warning`, `sample`. Use the `figures` utility for tabular numerals.
- Store (P1.3): `designSlice` holds `components: Component[]` (full objects, params included) and `areaBoundary`, plus selection, undo/redo (`past`/`future` snapshots of `{components, areaBoundary}`, cap 100). Every design action goes through `commit()`, which records history and drops a selection that no longer exists. `addComponents` = one undo step (build list / generated layout). `setComponentGeometry(id, g, origin?)` marks drawn; default origin `user`, the generator passes `generated`. `duplicateComponent(id, name?)` offsets 25 m E/S, new section/feature ids, selects the copy; the UI passes the translated name. `loadDesign()` replaces everything and clears history (for project files).
- Component list (P1.4): docked left of the map on desktop, under it on mobile. Row actions (zoom to, hide/show, ⋯ menu with rename/duplicate/delete) show on hover/focus, always on touch. Double-click a name to rename. Undo/redo buttons in the list header plus Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y (ignored while typing). Rows show P50 and share of total from `useEstimate()` once drawn.
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

- **P6.3 is done (by A, per the human):** `src/engine/site.ts` + tests, wired in `computeEstimate` after each component's lines. Please tick it in your list. Reports/PDF can show the `near_*` flags and `site-*` line items like any other.

- Swap `approxMeasureProject` for `measureProject` from `@/lib/geo/measure` in `useEstimate.ts` (it's on main, same contract, geodesic).
- Done: landing uses your parse + review (P7.4). Park features: I added one line to your `applyDraft` (`plannedFeatures` param); see handoff notes.
- Optional: keep the estimate in the store (or a context) so the map and the panel share one computation.
- Custom elements have no pricing form yet: mount your `CustomPricingForm` wherever suits (e.g. inputs tab); the Add menu creates `custom` components/features with just a name.
- `updateComponents(patches)` is on main (your P7.5 request).

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
- [x] P1.7 Editing: move, rotate, scale, vertex edit, holes, duplicate, mirror, delete
- [x] P1.8 Multi-section buildings: split/merge sections, per-section storeys and roof
- [x] P1.14 `measure.ts` (Turf) + unit tests; per-component, per-section, and project totals — **merge early, B's engine depends on it**
- [x] P1.15 Live measurement labels + measurements panel + metric/imperial toggle
- [x] P1.6 Add menu incl. "Custom…" elements and custom park features (name + shape; the pricing choice form is B's `CustomPricingForm` — mount a placeholder until it exists)

### S2 → S3 — Rendering, layout & estimate on the map · Core
- [x] P1.13 Roads along any path at true width with markings, curbs, sidewalks, cycle lanes
- [x] P1.11 Procedural 2D rendering: roofs from actual section shapes, height shading, storeys badges, original SVG icon set
- [x] P1.12 Procedural park rendering: grass fill, seeded tree scatter, fitted field markings, parking stalls, custom feature hatch
- [x] P1.9 `src/data/typologies.json` (you own this one data file) + smart-start shape for a known type
- [x] P1.10 Generate starting layout (seeded): roads → buildings fronting roads → parks; spatial hints; no overlaps; Regenerate
- [x] P3.2 Workspace layout: view (left) + B's `<EstimatePanel/>` (right); view switcher 2D plan / 3D map
- [x] P3.3 Shared selection across views, component list, and line items; hover tooltips with cost (from `useEstimate`, fixture until live)
- [x] P3.4 "Colour by cost" toggle on map views
- [x] P3.9a Flag markers on the map (B owns the flags list)
- [x] P7.4 Creation flow navigation: Describe → Review build list (B's screen) → Locate → Draw each planned component (checklist) → Questions (B's panel) → Estimate
- [x] P4.5 Landing page: prompt box (calls B's parse), blank map option, demo cards, open project file button (B's loader)
- [x] P4.3 Unsaved-changes `beforeunload` warning; "New project" reset

### S3 → S4 — 3D and context
- [x] P1.18 3D map view: every building section extruded to its own height · Core
- [x] P1.16 Advisory cross-component warnings (overlaps, outside park/area, unusual values) · Core
- [x] P1.17 `/api/geo/snap` (OSRM, cache, timeout) + "Snap to streets" with fallback · Stretch
- [x] P5.1 Map snapshot capture helper for B's PDF export · Core
- [x] P6.1 `/api/geo/context` (Overpass) with cache/timeout/fallback · Stretch
- [x] P6.2 Site tab + map overlays with buffer rings · Stretch
- [x] P9.1 Road cross-section SVG per road, opens on selection, clickable · Stretch
- [x] P9.2 3D site scene in the view switcher; positioned from map coordinates; shared selection · Stretch
- [x] P9.3 3D elements: buildings · Stretch
- [x] P9.4 3D elements: parks, roads with buried pipes, structures · Stretch
- [x] P9.5 Colour by cost + cost tooltips in 3D site · Stretch

### S4 → S5 — Polish (after feature freeze)
- [x] Zoning map layer (Waterloo) · optional
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
| Municipality → map & region | `src/components/build-list/build-list.ts` (`locateMunicipality`), `src/lib/geo/region.ts` (+ test), `src/components/map/map-view.tsx` | On build-list confirm the municipality is geocoded; the map opens at / flies to `project.location`; region set by place-name match (Ontario regions only), else unchanged |
| Map | `src/components/map/map-view.tsx`, `map-context.tsx` (`useMap()`), `basemap-toggle.tsx`, `workspace-shell.tsx`; `src/lib/geo/basemaps.ts` | MapTiler streets/hybrid, OpenFreeMap positron without key; worker copied to `public/maplibre` by `pnpm copy:maplibre` (runs in dev/build) |

## Environment

- **Vercel URL:** https://publicworkscost.vercel.app (dashboard: https://vercel.com/hackathon-aqeeljawed/publicworkscost)
- **Env vars configured in Vercel:** `NEXT_PUBLIC_MAPTILER_KEY` (verified live 2026-09-26: MapTiler streets, satellite, search). Still to add before P7: `GEMINI_API_KEY`, `AI_PROVIDER`.
