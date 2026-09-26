# PROGRESS.md

> The single source of truth for where the build is. Read this at the start of every session.
> Update it after **every completed task**, not just at the end of a phase, so a context reset never loses work.
> Keep "Current state" short and always accurate. History lives in git commits; spec changes live in the `SPEC.md` Change log.

## Current state

- **Current phase:** P0 — Foundation
- **Current task:** P0.1
- **Status:** not started   <!-- not started | in progress | blocked | phase complete, awaiting review -->
- **Next action:** Scaffold the Next.js project (P0.1).
- **Blockers / needs from human:** none
- **Last updated:** —

## Handoff notes

> Anything the next session must know that isn't obvious from the checklist: where an unfinished task stopped, gotchas, things to verify. Replace (don't accumulate) each session.

- _(none yet)_

## Task status legend

`[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (reason in Known issues) · `[-]` skipped (reason in the SPEC.md Change log)

Task ids (e.g. `P1.3`) are used in commit messages and the SPEC.md Change log.

---

## Phase checklists

### P0 — Foundation
- [ ] P0.1 Scaffold Next.js (App Router) + TypeScript strict + pnpm
- [ ] P0.2 Tailwind + shadcn/ui + Public Sans + design tokens (light/dark)
- [ ] P0.3 next-intl with `/en` and `/fr` routing, `messages/en.json`, `messages/fr.json`
- [ ] P0.4 Zustand, zod, Vitest, ESLint, Prettier; scripts `typecheck`, `lint`, `test`
- [ ] P0.5 Stateless API route conventions (zod validation helper, error format, in-memory rate limiter)
- [ ] P0.6 App layout shell (top bar, language toggle, sample-data badge)
- [ ] P0.7 `.env.example`, `README.md`, `DEPLOY.md`
- [ ] P0.8 Deploy placeholder to Vercel; record URL below
- **Done when:** app runs locally and on Vercel in both locales.

### P1 — Map, freeform design & live measurements
- [ ] P1.1 Workspace page with MapLibre, basemap (MapTiler, OpenFreeMap fallback), controls
- [ ] P1.2 Geocoding search with fly-to
- [ ] P1.3 Project store (Zustand) holding multiple components (planned/drawn, user/generated), selection, undo/redo
- [ ] P1.4 Component list panel (select, zoom to, rename, duplicate, hide/show, delete)
- [ ] P1.5 Freeform draw tools for all components and features: polygon, rectangle, circle/ellipse, freehand, line/polyline, point; project area
- [ ] P1.6 Add menu incl. "Custom…" elements and custom park features (name + shape + pricing choice UI)
- [ ] P1.7 Unrestricted editing: move, rotate, scale, vertex edit, holes, duplicate, mirror, delete
- [ ] P1.8 Multi-section buildings: split/merge sections, per-section storeys and roof
- [ ] P1.9 `typologies.json` + smart-start: procedurally generated starting shape for a known type from prompt/params
- [ ] P1.10 Generate starting layout (seeded, deterministic): roads, then buildings fronting roads, then parks; spatial hints; no overlaps; Regenerate
- [ ] P1.11 Procedural 2D rendering: roofs from actual section shapes, height shading, storeys badges, original SVG icon set
- [ ] P1.12 Procedural park rendering: grass fill, seeded tree scatter, fitted field markings, generated parking stalls, custom feature hatch
- [ ] P1.13 Roads along any path at true width with lane markings, curbs, sidewalks, cycle lanes (zoom-dependent)
- [ ] P1.14 Measurement helpers (Turf) + unit tests; per-component, per-section, and project totals
- [ ] P1.15 Live measurement labels + measurements panel + metric/imperial toggle
- [ ] P1.16 Advisory cross-component warnings (overlaps, outside park/area, unusual values), never blocking
- [ ] P1.17 `/api/geo/snap` (OSRM, cache, timeout) + "Snap to streets" toggle with straight-line fallback
- [ ] P1.18 3D map view: every building section extruded to its own height (tilt/rotate)
- **Done when:** a user can design any shapes and combinations (incl. multi-section buildings and custom elements), or generate a starting layout and edit it freely, with a recognizable 2D plan and correct live measurements.

### P2 — Data & cost engine
- [ ] P2.1 Zod schemas: Project, Geometry, Scenario, Estimate, LineItem, Flag, reference data
- [ ] P2.2 Seed data: `unit-prices.json`
- [ ] P2.3 Seed data: `building-costs.json` (incl. housing subtypes), `park-features.json`, `structures.json`
- [ ] P2.4 Seed data: `regional-factors.json` (incl. reference CMA per region), `overrun-reference.json`
- [ ] P2.5 Script `fetch-statcan-bcpi.ts` → `src/data/public/statcan-bcpi.json` (filtered, with source + retrieval date) + zod schema
- [ ] P2.6 Script `fetch-canadabuys.ts` → `src/data/public/canadabuys-awards.json` (Ontario construction awards, per data dictionary) + zod schema
- [ ] P2.7 `pnpm data:refresh` script; commit generated files
- [ ] P2.8 Component type: road (param catalog + quantity derivation + flags) + tests
- [ ] P2.9 Component type: park + tests
- [ ] P2.10 Component type: building (sections, GFA, shape complexity factor, roof premiums, fit-on-site check, school/hospital uncertainty) + tests
- [ ] P2.11 Component type: structure (pin or drawn span) + tests
- [ ] P2.12 Custom elements: matched or user-entered rates, wide default bands, lower class + tests
- [ ] P2.13 Pricing: regional factor, BCPI price-year→today escalation (with labelled proxies), trailing-trend default escalation rate, shocks, overrides + tests
- [ ] P2.14 Winter logic, soft costs, taxes + tests
- [ ] P2.15 Estimate class from completeness score + improvement hints + tests
- [ ] P2.16 Seeded Monte Carlo + overrun reference + contingency + tests
- [ ] P2.17 Drivers (tornado, labelled by component) + flags aggregation (tagged by component) + tests
- [ ] P2.18 Project roll-up: per-component costs, project mobilization, per-component + project percentiles from one simulation, project class from component classes + tests
- [ ] P2.19 `computeEstimate()` entry point; multi-component and determinism tests
- **Done when:** complete, deterministic combined and per-component estimates for demo-style projects (including several components of the same type); all tests pass.

### P3 — Estimate & visualize workspace
- [ ] P3.1 Engine wired to store with debounced recalculation (Web Worker if needed)
- [ ] P3.2 Combined layout: view (left) + estimate panel (right); view switcher 2D plan / 3D map
- [ ] P3.3 Shared selection across views, component list, and line items; hover tooltips with cost; click filters estimate
- [ ] P3.4 "Colour by cost" toggle on map views
- [ ] P3.5 Scope selector: whole project / single component, respected by all tabs
- [ ] P3.6 Estimate tab: range display, class badge + hints, contingency, overrun risk card
- [ ] P3.7 Market evidence card: StatCan price trend, matched CanadaBuys awards with links, optional municipal tenders, sources footnote
- [ ] P3.8 Per-component breakdown (stacked bar + table), distribution chart, category breakdown, drivers tornado, per-unit metrics
- [ ] P3.9 Flags list + flag markers on map
- [ ] P3.10 Line items tab: editable table grouped by component then category, sources, override indicators, reset
- [ ] P3.11 Inputs tab: parameters per component with source badges; component list shows P50 and share
- **Done when:** the view and estimate update together within ~300 ms of any edit, and clicking any element shows its cost.

### P4 — Project files, demo projects & landing
- [ ] P4.1 Project file schema with `schemaVersion` + download (`.pwcost.json`)
- [ ] P4.2 Open project file with zod validation and clear error messages
- [ ] P4.3 Unsaved-changes `beforeunload` warning; "New project" reset
- [ ] P4.4 Three bundled demo projects (static JSON) loading into the workspace
- [ ] P4.5 Landing page: whole-build prompt box (keyword fallback until P7), blank map option, demos, open project file
- **Done when:** a project downloads and reopens exactly; each demo loads into the workspace.

### P5 — Reports & exports
- [ ] P5.1 Map snapshot capture
- [ ] P5.2 PDF council report (template-based narrative), EN/FR
- [ ] P5.3 Excel workbook (Summary, Line Items, Assumptions, Scenarios)
- [ ] P5.4 Export tab
- **Done when:** all exports work for each demo project in both languages.

### P6 — Site context & flags
- [ ] P6.1 `/api/geo/context` (Overpass: schools, hospitals, waterways, rail, road attributes) with cache/timeout/fallback
- [ ] P6.2 Site tab + map overlays with buffer rings
- [ ] P6.3 Site-context flags in engine + reports; params auto-filled with source `site_context`

### P7 — AI features
- [ ] P7.1 AI provider interface + GeminiProvider (default), AnthropicProvider, NoneProvider; structured output from zod, validation, retry, timeout, 429 handling, per-IP rate limit, result caching
- [ ] P7.2 `/api/ai/parse` → build list of components (types, counts, params) + keyword fallback
- [ ] P7.3 Build list review screen (edit, remove, duplicate, add components)
- [ ] P7.4 Creation flow: Describe → Review build list → Locate → Draw each planned component (checklist) → Questions → Estimate
- [ ] P7.5 `/api/ai/questions` across all components (cost impact × cost share, "apply to all similar") + fallback + Questions panel
- [ ] P7.6 Document upload (processed in memory, never stored) + `/api/ai/extract` + accept/reject review
- [ ] P7.7 `/api/ai/narrative` with number check + template fallback; used in PDF
- [ ] P7.8 Cached AI outputs for demo projects
- **Done when:** full flow works with `AI_PROVIDER=gemini` and `AI_PROVIDER=none`, and degrades gracefully when rate-limited.

### P8 — Scenarios
- [ ] P8.1 Scenario create/duplicate/rename/delete
- [ ] P8.2 What-if controls (date shift, price shocks, per-component param/geometry changes, add/remove components)
- [ ] P8.3 Comparison view (up to 3)
- [ ] P8.4 Scenarios in exports (PDF comparison section, Excel sheet)

### P9 — 3D site scene & cross-sections
- [ ] P9.1 Road cross-section SVG per road component, opens on road selection, clickable elements
- [ ] P9.2 3D site scene added to the view switcher: all components positioned from map coordinates; focus/isolate component; shared selection
- [ ] P9.3 3D elements: buildings (type styles, floors)
- [ ] P9.4 3D elements: parks and features; roads with buried pipes; structures
- [ ] P9.5 Colour by cost in 3D site + element cost tooltips
- [ ] P9.6 Optional concept image provider (disabled without key)

### P10 — Polish & pitch readiness
- [ ] P10.1 Complete French translations
- [ ] P10.2 Accessibility pass
- [ ] P10.3 Mobile layout
- [ ] P10.4 Empty, loading, and error states everywhere
- [ ] P10.5 Performance check
- [ ] P10.6 `/data` page (all datasets incl. StatCan and CanadaBuys: source, date, licence, limits; BCPI trend chart)
- [ ] P10.7 Rehearse SPEC section 23 demo walkthrough; fix issues
- [ ] P10.8 Final deploy

---

## Feature map

> Where each feature lives. Update when files are added or moved, so a fresh session can find code without searching the whole repo.

| Feature | Key files | Notes |
| --- | --- | --- |
| _(filled in as features are built)_ | | |

## Known issues

> Bugs, limitations, and blocked items. Remove entries when fixed.

- _(none yet)_

## Environment & deployment

- **Production URL:** Vercel project `hackathon-aqeeljawed/publicworkscost`, auto-deploys on push to `main` (production alias not recorded)
- **Env vars configured in Vercel:** —
