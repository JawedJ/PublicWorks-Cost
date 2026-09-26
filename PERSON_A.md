# PERSON_A.md — Map, design & visuals

**Role:** everything the user sees and draws: app scaffold and layout, the map and freeform design tools, live measurements, procedural 2D rendering, starting-layout generation, site context on the map, 3D views and cross-sections, and the landing page.
**Owns:** see `TEAM.md` section 2. **Contracts you provide:** `measure.ts`, `designSlice.ts`, `store.ts`, the selection contract (TEAM.md section 3).
Task ids match `PROGRESS.md`; task details are in `SPEC.md`.

## Current state

- **Current task:** P0.1
- **Status:** not started   <!-- not started | in progress | blocked | at sync point -->
- **Next action:** Scaffold the Next.js project.
- **Blockers / needs from B:** none
- **Last updated:** —

## Handoff notes

> Where an unfinished task stopped, gotchas, things to verify. Replace each session.

- _(none yet)_

## Requests to Person B

- _(none yet)_

---

## Task list (in order)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` dropped. **Core** = needed for the demo. **Stretch** = drop first if behind.

### Before S1 (first hour) — Foundation · Core
- [ ] P0.1 Scaffold Next.js (App Router) + TypeScript strict + pnpm
- [ ] P0.2 Tailwind + shadcn/ui + Public Sans + design tokens (light/dark)
- [ ] P0.3 next-intl with `/en` and `/fr` routing, `messages/en.json`, `messages/fr.json`
- [ ] P0.4 Zustand, zod, Vitest, ESLint, Prettier; scripts `typecheck`, `lint`, `test`
- [ ] P0.6 App layout shell (top bar, language toggle, sample-data badge)
- [ ] P0.7 `.env.example`, `README.md`, `DEPLOY.md`
- [ ] P0.8 Deploy placeholder to Vercel (record URL below)
- [ ] A.1 Create `src/lib/store/store.ts` with `designSlice.ts` (selection contract included) and an empty `projectSlice.ts` stub for B; merge to `main` **as early as possible** so B can build on it

### S1 → S2 — Map & drawing · Core
- [ ] P1.1 Workspace page with MapLibre, basemap (MapTiler, OpenFreeMap fallback), controls
- [ ] P1.2 Geocoding search with fly-to
- [ ] P1.3 Store: multiple components (planned/drawn, user/generated), selection, undo/redo
- [ ] P1.4 Component list panel (select, zoom to, rename, duplicate, hide/show, delete)
- [ ] P1.5 Freeform draw tools: polygon, rectangle, circle/ellipse, freehand, line/polyline, point; project area
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
| _(fill in as you build)_ | | |

## Environment

- **Vercel URL:** —
