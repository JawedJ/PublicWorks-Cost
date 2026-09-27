# PERSON_B.md — Engine, data, AI & outputs

**Role:** everything behind the numbers and the words: schemas, the cost engine, seed and public data (StatCan, CanadaBuys), the estimate panel, AI (prompt parsing, build list, questions, documents, narrative), project files, scenarios, and exports.
**Owns:** see `TEAM.md` section 2. **Contracts you provide:** schemas, fixtures, `computeEstimate`, `useEstimate`, `projectSlice.ts`, `<EstimatePanel/>` (TEAM.md section 3).
Task ids match `PROGRESS.md`; task details are in `SPEC.md`.

## Current state

- **Current task:** none in progress. Exports (P5.2–P5.4) done; demos (P4.4) wait on A's drawn files
- **Status:** not started   <!-- not started | in progress | blocked | at sync point -->
- **Next action:** demo projects (needs A's drawn files; the human picks them), then /data page (P10.6).
- **Blockers / needs from A:** none
- **Last updated:** 2026-09-26 (P3.6 Estimate tab)

## Handoff notes

> Where an unfinished task stopped, gotchas, things to verify. Replace each session.

- UI (per the human): the estimate panel uses shadcn components only: `Select` scope, `Tabs`, `Card` composition everywhere, `Badge`, `Chart` (Recharts; horizontal bars for components/categories, histogram with P10/P50/P90 reference lines), `Accordion` + `Alert` for flags and market evidence, `Table` for line items, `Field` + `Select`/`Switch`/`Input` for inputs, `ToggleGroup` for booleans and pricing mode, `Skeleton`/`Spinner`/`Empty` for states. The shadcn skill lives in `~/.claude/skills/shadcn` (user level); run its CLI with `pnpm dlx shadcn@latest`.
- Zoning (MVP, per the human): Waterloo from a committed snapshot of the whole zone map (`pnpm data:zoning` → `src/data/public/waterloo-zoning.json`, 2,918 zones; source is `gis.waterloo.ca/.../Public_Operations/MapServer/49`, the service behind the city's public viewer, found via its Geocortex `PublicMap` config), point-in-polygon in `src/lib/zoning/waterloo.ts`; `POST /api/zoning/map { bbox }` returns zone polygons (≤800, box ≤ ~5 km). Ottawa and Cambridge are live queries. Kitchener has none. `src/lib/zoning/sources.ts` (one entry per city: bbox, ArcGIS layer URL, field reader), `lookup.ts` (point query per building, 8 s timeout, ~10 m cache), `POST /api/zoning` (geo rate limit). `useZoningLookup()` (mounted in `EstimatePanel`) looks up drawn buildings' centres 1.5 s after they're added/moved and calls `setZoningContext`. Engine `src/engine/zoning.ts`: `zoning_zone` (info; warning if site-specific), `zoning_use` (warning on obvious mismatch), one `zoning_not_checked` / `zoning_lookup_failed` project flag. No limits transcribed (Z.2–Z.4 dropped). Z.6 `/data` page part left for P10.6. Northgate's buildings come back C7-60 / C7-81 (Conestoga, Commercial).
- P7.5: schemas in `src/lib/schemas/questions.ts`. `src/lib/questions/rank.ts` (pure, client + server): `candidates(req)` ranks unanswered params by costImpact × share, one per group (buildings by subtype, others by type) with `alsoApplies`; skips drawing-answered params and irrelevant special spaces; `fallbackQuestions`, `coerceAnswer`. `src/lib/ai/questions.ts` `askQuestions(req, provider)`: offers the top 20 candidates, the AI returns candidate ids + reason + suggested (validated/coerced), cached in memory; 429 → `ai_busy`. Route `POST /api/ai/questions`. Client `src/components/questions/`: `buildQuestionsRequest(estimate)` (drawn components + shares + site flag notes), `requestQuestions` (never throws), `answerQuestion(ids, paramId, value)` (one undo step, source `user`); `<QuestionsPanel>` is the panel's Questions tab (asks once on open, "Ask again", answered params disappear, scoped to the selected component). Live Gemini: ~2 s, sensible picks for Northgate.
- P6.3: A built the site flags + allowances in `src/engine/site.ts` at the same time (per the human); mine were dropped in the merge. Kept from mine: `src/engine/site-params.ts` `siteParamSuggestions(road, siteContext)` (nearest OSM road within 15 m: `lanes`, `highway` → `roadClass`, `sidewalk` → `sidewalkSides`), applied by `setSiteContext` as `site_context` params only where still default (one undo step). A's lookup now runs automatically, so the fill happens as soon as a road's area is looked up.
- P3.7: `src/lib/estimate/evidence.ts` (pure, tested): `benchmarks(estimate, components, scopeId)` (building-only and all-in $/sq ft vs the subtype's Altus range; road $/m vs `altus-benchmarks.json` by `roadClass`), `priceTrend(region)` (4-quarter BCPI non-residential change for the region's CMA), `comparableAwards(types)` (3 most recent CanadaBuys by tag). UI `market-evidence-card.tsx`. P3.8: `charts.tsx` (plain divs): `ComponentBreakdown` (stacked bar + list, replaces the old list), `DistributionChart`, `CategoryBreakdown` (scoped), `DriversTornado`, `PerUnitMetrics`; whole-project-only except category. `EstimateTab` now takes `components` and `region`. The Northgate estimate fixture still has the old sample building prices (tests only).
- Real data: building base rates are Altus Group 2026 (GTA/Ottawa average, per-subtype `source`, price year 2026; SPEC Change log). B.3 added 7 more Altus building subtypes (+ typologies) and `<CustomPricingForm name pricing onChange/>` in `custom-pricing-form.tsx`, shown in the Inputs tab for custom components and for each custom park feature. `customBases(refData)` / `suggestBasis(name, bases)` in `src/engine/templates/custom.ts`; building bases use ids `building:<subtype>` (per m² of drawn area). Matched = wider band; own rate = user low/high or −30%/+60%.
- P3.11: `<InputsTab components componentId/>` in `inputs-tab.tsx` (third panel tab). Each catalog param, highest cost impact first, resolved value (subtype defaults applied), number/enum/boolean editor, source badge (Default / You / From prompt / From document / From site) with evidence, "Use default" → `clearComponentParam`. Edits use `setComponentParam` (source `user`). Shared `NumberInput` (commit on blur/Enter) in `number-input.tsx`, also used by line items. `useEstimate` now shares one result per store state across all callers (panel, map colours, 3D, component list), so extra callers are free; new callers start from the cached result.
- P4.1–P4.2: `src/lib/project-file.ts` (pure, tested): `serializeProject` (stamps `CURRENT_SCHEMA_VERSION`), `projectFileName(name)` → `slug.pwcost.json`, `parseProjectFile(text)` → `{ ok, project }` or `{ ok: false, error: too_large | invalid_json | not_project | newer_version | invalid, detail }` (first zod issue path). No migrations (only v1). Buttons in `src/components/project-file/project-file-buttons.tsx`: `<DownloadProjectButton/>` (disabled with no components) and `<OpenProjectButton/>` (file picker, confirm before replacing work, `loadProject` then `router.push("/workspace")`, inline error). Strings under `projectFile`. Not mounted yet: request to A.
- P3.10: `EstimatePanel` now has a tab bar (Estimate, Line items; add Inputs in P3.11 to `TABS`). `<LineItemsTab>` in `line-items-tab.tsx`: grouped by component (estimate order, project-level items last, read-only), then category (schema order); quantity and unit price edit in place (blur/Enter commits, Escape cancels) via `setOverride(componentId, kind, localId)` where `localId` = line id minus `${componentId}:`; overridden cells are highlighted with a Reset link, plus "Reset all" per component. Strings under `lineItems`. `tabs.test.tsx` renders both tabs with Northgate through `renderToStaticMarkup` and fails on missing strings (vitest now also picks up `*.test.tsx`).
- P3.6: `<EstimateTab estimate scoped/>` in `src/components/estimate/estimate-tab.tsx`. Shows P50 + a P10–P90 bar with the P50 marker, class badge with accuracy range (`CLASS_RANGE` now exported from `@/engine`) and up to 5 improvement hints (click selects that component), and for the whole project: contingency and overrun risk cards plus the per-component list. Component scope shows its share instead. `scopeEstimate` now also returns `hints`. P3.9b: `<FlagsList flags names?/>` in `flags-list.tsx`: severity-sorted (high → info) with icon, explanation, cost effect; for the whole project it names the component(s) (or "Whole project") and clicking a single-component flag scopes the panel to it.
- P7.1–P7.3 (first pass, "get A unblocked"): `src/lib/ai/` has the `AIProvider` interface, `AIUnavailableError`, `noneProvider`, and a REST `createGeminiProvider` (JSON schema from zod, validated, 1 retry, 20 s timeout, 429 → `rate_limited`). `getAIProvider()` reads env; no key → none. `parsePrompt()` in `src/lib/ai/parse.ts` validates types/subtypes/params against the engine catalogs + A's size hints (`storeys`, `areaM2`, `lengthM`; `gfaOverrideM2` is a real param), expands counts (max 20), caches AI results in memory, and falls back to A's `keywordParse`. Route `POST /api/ai/parse` `{ prompt, locale }` → `ParseResponse` (`src/lib/schemas/draft.ts`). Client: `requestParse()` (never throws; local fallback) + `applyDraft()` in `src/components/build-list/build-list.ts`, `<BuildListReview>` in `build-list-review.tsx`, strings under `buildList`. Tested live with Gemini: parse uses the fast model (`GEMINI_MODEL_FAST`, default `gemini-flash-lite-latest`, ~2–3 s); `gemini-flash-latest` (3.8 Flash, thinking) took >20 s. Today's date is passed in so "next spring" resolves. Park amenities come back as `features` (park-features.json kinds) on the park item. **Not done yet (polish):** AnthropicProvider; spatial hints are text only; features aren't placed by `applyDraft` (needs A's layout); keyword fallback splits "streets with watermains and sewers" into separate components.
- P3.5: scope = A's `selectedComponentId` (no separate state). Tabs get scoped range, class, line items and flags from `scopeEstimate(estimate, selectedId)` in `src/lib/estimate/scope.ts`; an unknown id falls back to whole project. Contingency and the component list show only for the whole project.
- P2.1 schemas are merged to `main`.
- P2.5: `pnpm data:bcpi` runs `scripts/fetch-statcan-bcpi.ts` with plain `node` (Node 26 strips types; `scripts/package.json` sets ESM). Scripts can't use the `@/` alias. `statcanBcpi` from `@/data`: series keyed by `geo` × `type` × `division`, points `["2026Q2", 108.9]` oldest first. A few type × division combos aren't published (e.g. Ottawa single-detached earthwork); the engine must fall back to the composite division.
- P2.8: engine pattern. Each template (`src/engine/templates/*.ts`) exports a `ComponentTemplate` (`src/engine/types.ts`): `paramCatalog`, optional `subtypeDefaults`, `deriveQuantities(ctx) → QuantityLine[]`, `flags(ctx) → TemplateFlag[]`. A `QuantityLine` has a component-local `localId` (overrides are keyed by it; line item id will be `${componentId}:${localId}`) and a `PriceRef` (`unitPrice` id, or `direct` price for building/park/structure/custom). `resolveParams` fills defaults and clamps. Bilingual text via `t()` / `L()` in `src/engine/text.ts`. Test helpers in `src/engine/__tests__/helpers.ts`. Road params reuse the fixture ids; new ids: `scope`, `cycling`, `watermainMaterial`, `rockExpected`, `utilityConflicts`, `boulevardWidthM`.
- P3.1: `useEstimate()` in `src/lib/estimate/useEstimate.ts` (150 ms debounce, fixed seed, main thread). It uses A's `measureProject` from `@/lib/geo/measure` (the temporary `approx-measure.ts` is deleted). Minimal `<EstimatePanel/>` in `src/components/estimate/estimate-panel.tsx` (P50, range, class, contingency, per-component list that selects on click, flags); strings under `estimate` in messages.
- P2.10–P2.19: `computeEstimate(project, measurements, refData, { seed, now?, iterations? })` in `src/engine/index.ts` (MVP-simple). Unit prices include region × BCPI (price year → latest quarter; non-buildings use non-residential as proxy) × scenario shock × 8% winter premium. Escalation to construction midpoint is a separate amount; the BCPI trailing-8q rate is used while `settings.escalationRate` is still the 0.04 default. Mobilization = 6% of direct (one project line). Soft cost %s per type in `SOFT`. Class from answered high-impact params. Monte Carlo: triangular per line, correlated by price category (ρ 0.6), lognormal overrun per component. Drivers = price categories only. Northgate: ~$52M P50, 42 ms for 5,000 iterations.
- P2.9: park feature params live in `featureParamCatalog` (per kind) in `templates/park.ts`, resolved with `resolveDefinitions`. Feature line ids are `feature:<featureId>` (+ `:lighting`). Kinds in `park-features.json` without params (skate_park, dog_park, …) are priced by drawn area; `custom` kinds are skipped until P2.12; unknown kinds get a `park_feature_not_priced` flag.
- P2.6/P2.7: `pnpm data:refresh` runs both scripts (~1 min). CanadaBuys needs a browser-like User-Agent (403 otherwise). Filter: CNST category + delivery region naming Ontario/Ottawa/NCR (not Gatineau/Quebec); no region → skipped. ~98 awards; `tags` (road/utilities/park/building/structure) come from title + GSIN/UNSPSC keywords and are rough ("building" is broad). No stable notice URL in the data, so `url` is a CanadaBuys search link by solicitation number.
- P2.2–P2.4: `refData` from `@/data` is ready for the engine. Overrun lookup: prefer the entry matching type + subtype + class, else type + class (no subtype).
- B.2: `projectSlice` holds `project: ProjectInfo` (the Project minus `components`/`areaBoundary`, which are A's). `selectProject(state)` rebuilds the full `Project`; it returns a new object each call, so don't pass it straight to `useStore(...)` in a component (use `getState()`, `useShallow`, or memoize in `useEstimate`). Param/override edits call A's `updateComponent` (one undo step each). `DEFAULT_REGION = "ontario_average"` must exist in `regional-factors.json` (P2.4). Questions state is deferred to P7.5, when the question schema exists.
- P0.5: every API route uses `jsonRoute({ name, body, rateLimit }, handler)` from `@/lib/api`. Errors are `{ error: { code, message, issues?, retryAfterSeconds? } }`; the client maps `code` to next-intl strings (use `readApiError(res)`). Limits per route family live in `rateLimiters` (`ai` 10/min, `geo` 60/min, `export` 10/min per IP, per server instance). Throw `new ApiError("upstream_timeout" | "upstream_error", ...)` from provider code.
- B.1 fixtures: `src/lib/fixtures/northgate.{project,estimate}.json`, imported typed and validated via `@/lib/fixtures`. Generated by a throwaway script (not committed) from local-metre coordinates around (-80.53, 43.50), north Waterloo; to change them, edit the JSON directly. Estimate numbers are hand-made but internally consistent (tests check totals, ids, percentile order). Param ids used in fixtures (e.g. `lanes`, `soilCondition`, `quality`, `apparatusBays`, `spanM`) should be reused by the engine's param catalogs.
- Contract changes are in the SPEC Change log, tagged P2.1 [B]. The one that affects A: `ProjectMeasurements` is `{ components, totals }`, not an intersection type.

## Requests to Person A

- **New look (Haulix-inspired, per the human).** I swapped the theme tokens in `globals.css` (your file, one block; dark only: light and dark are the same palette): near-black background, cards one step lighter, 8% hairline borders, radius 1rem, pale lime `primary` (logo, primary buttons, toggles, P50 marker), charts `chart-1` teal, `chart-2` violet, `chart-3` lime, `chart-4` amber, `chart-5` red. Everything shadcn already follows it. My panel is now built only from shadcn components (per the human, using the shadcn skill): added `card tabs badge select separator alert accordion table chart progress tooltip field input switch toggle-group skeleton empty scroll-area label spinner` to `src/components/ui/` (+ `recharts`). Please use these rather than hand-styled divs in your parts too (e.g. `Card` for panels, `Badge` for chips, `ToggleGroup` for the view switcher, `Chart` for any charts). To finish the look in your parts, from the reference shots:
  - **Left icon rail** (optional): slim rounded rail, icons in round buttons, the active one a white circle with dark icon.
  - **Top bar**: pill stat chips next to the title (e.g. `StatChip` "Components 6", "P50 $58.6M", "Class C"), search as a rounded pill, primary action as a lime pill button (`Button` default variant now is).
  - **Cards everywhere**: `rounded-2xl border bg-card p-4`, title row = icon + medium title + muted subtitle, round ghost icon button on the right.
  - **Map**: a dark basemap would match (the UI is dark now); the light OpenFreeMap style still works.
  - **Panel aside**: use `bg-background` instead of `bg-card` on the estimate panel's `<aside>` (my panel paints `bg-background` but a seam shows below the fold).
- **Culvert shows two permit flags (small).** Your `near_waterway` and the structure template's `in_water_permit` both fire on a fish-habitat culvert (costs aren't doubled: permit/ESC vs in-water work). Fine to leave, or skip `near_waterway`'s flag when `in_water_permit` is present.
- **Site lookup: include local streets (P6.3, small).** `/api/geo/context` only fetches `highway` motorway|trunk|primary|secondary, so road auto-fill (lanes, class, sidewalks from OSM tags) only works along arterials. Adding `tertiary|residential|unclassified` (tags already pass through for roads) lets it fill local streets too. Floodplain features aren't fetched yet either; the engine flags them if you add any.
- Done by A (P7.4, 2026-09-26): creation flow with the build-list review, project file buttons (top bar + landing), P50/share in the component list, park features from the prompt (`plannedFeatures` param, placed with the park), language toggle removed, `updateComponents`.
- **Zoning map layer (optional, Waterloo).** Zone polygons are now available: `POST /api/zoning/map` with `{ bbox: [w, s, e, n] }` (≤ ~5 km box) returns a GeoJSON FeatureCollection with `properties.code`, `label`, `family` (e.g. Residential, Commercial, Employment, Open Space, Uptown). A toggleable layer coloured by `family` with the code on click would show it; only if you have time.

---

## Task list (in order)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` dropped. **Core** = needed for the demo. **Stretch** = drop first if behind.

### Before S1 (first hour) — Contracts · Core
While A scaffolds, draft these locally; commit right after A's scaffold lands on `main`.
- [x] P2.1 Zod schemas: Project, Component, Geometry, BuildingSection, PlacedFeature, Measurements, Scenario, Estimate, LineItem (with `elementRef`, log it in the SPEC Change log), Flag, reference data
- [x] B.1 Fixtures: `src/lib/fixtures/northgate.project.json` and `northgate.estimate.json` (valid against the schemas; hand-written numbers are fine)
- [x] P0.5 Stateless API route conventions (zod validation helper, error format, in-memory rate limiter)
- [x] B.2 `projectSlice.ts` (params, paramMeta, overrides, settings, scenarios) plugged into A's `store.ts`

### S1 → S2 — Data & engine · Core
- [x] P2.2 Seed data: `unit-prices.json`
- [x] P2.3 Seed data: `building-costs.json` (incl. housing subtypes), `park-features.json`, `structures.json`
- [x] P2.4 Seed data: `regional-factors.json` (incl. reference CMA per region), `overrun-reference.json`
- [x] P2.5 Script `fetch-statcan-bcpi.ts` → `src/data/public/statcan-bcpi.json` + schema
- [x] P2.6 Script `fetch-canadabuys.ts` → `src/data/public/canadabuys-awards.json` + schema
- [x] P2.7 `pnpm data:refresh`; commit generated files
- [x] P2.8 Component type: road + tests
- [x] P2.9 Component type: park + tests
- [x] P2.10 Component type: building (sections, GFA, shape complexity, roofs, fit-on-site, school/hospital uncertainty) + tests
- [x] P2.11 Component type: structure + tests
- [x] P2.12 Custom elements: matched or user-entered rates, wide bands, lower class + tests
- [x] P2.13 Pricing: regional factor, BCPI escalation (labelled proxies), trailing-trend default rate, shocks, overrides + tests
- [x] P2.14 Winter logic, soft costs, taxes + tests
- [x] P2.15 Estimate class from completeness score + improvement hints + tests
- [x] P2.16 Seeded Monte Carlo + overrun reference + contingency + tests
- [x] P2.17 Drivers (tornado, by component) + flags aggregation + tests
- [x] P2.18 Project roll-up: per-component costs, mobilization, per-component + project percentiles, project class + tests
- [x] P2.19 `computeEstimate()` entry point; multi-component and determinism tests
- [x] P3.1 `useEstimate()` wired to the live store (uses A's `measureProject`), debounced, Web Worker if needed — **the S2 integration milestone**

### S2 → S3 — Estimate panel, AI flow & project files · Core
- [x] P3.5 Scope selector: whole project / single component, respected by all tabs
- [x] P3.6 Estimate tab: range display, class badge + hints, contingency, overrun risk card
- [x] P3.7 Market evidence card: StatCan price trend, matched CanadaBuys awards with links, optional municipal tenders, sources footnote
- [x] P3.8 Per-component breakdown, distribution chart, category breakdown, drivers tornado, per-unit metrics
- [x] P3.9b Flags list in the panel (A owns the map markers)
- [x] P3.10 Line items tab: grouped editable table, sources, overrides, reset
- [x] P3.11 Inputs tab: parameters per component with source badges; P50 and share for A's component list
- [x] B.3 `CustomPricingForm` for custom elements (matched / own rate), in the Inputs tab
- [~] P7.1 AI provider interface + GeminiProvider (default), AnthropicProvider, NoneProvider; zod structured output, retry, timeout, 429 handling, per-IP rate limit, caching
- [x] P7.2 `/api/ai/parse` → build list (types, counts, params, spatial hints) + keyword fallback
- [x] P7.3 Build list review screen (edit, remove, duplicate, add components)
- [x] P4.1 Project file schema with `schemaVersion` + download (`.pwcost.json`)
- [x] P4.2 Open project file with zod validation and clear errors

### S2 → S3 — Zoning limits (SPEC 8.3) · Core
Flags only; never block, never change the estimate. Do Waterloo first (demo city).
- [x] Z.1 `ZoningContext` + zone-limits schemas; `zoningContext` on `Project`; `/api/zoning` route skeleton with cache, timeout, "not checked" fallback
- [-] Z.2 Waterloo: zone map lookup + `src/data/zoning/waterloo.json` limits (By-law 2018-050)
- [-] Z.3 Toronto: script-built zone + height overlay JSON + `toronto.json` limits (By-law 569-2013)
- [-] Z.4 Ottawa: confirm by-law in force (2008-250 vs 2026-50), map lookup + `ottawa.json` limits
- [x] Z.5 Engine zoning checks (height, storeys, coverage, FSI, setbacks, uses) → advisory flags + tests
- [~] Z.6 Zoning section on `/data` page and in flags list (source, by-law, date, limits)

### S3 → S4 — Questions, exports, demos
- [x] P7.5 `/api/ai/questions` across components + fallback + Questions panel · Core
- [ ] P4.4 Three demo projects (A draws geometry in the app and downloads the project file; you add params, cached AI outputs, and scenarios) · Core
- [ ] P7.8 Cached AI outputs for demo projects · Core
- [x] P5.2 PDF council report (template narrative, A's map snapshot), English · Core. `src/lib/export/pdf.ts` (jsPDF + autotable, loaded on demand) from the shared model in `src/lib/export/report-data.ts`. Cover with map (fit to project, camera restored), summary, build-up, risk, components, categories, drivers, grouped flags, scenarios, assumptions, sources
- [x] P5.3 Excel workbook (Summary, Line Items, Assumptions, Scenarios) · Core. `src/lib/export/xlsx.ts` (ExcelJS, on demand), plus a Flags sheet; line totals are live formulas where qty × price = total
- [x] P5.4 Export tab · Core. `src/components/estimate/export-tab.tsx`: PDF (site plan switch), Excel, project file
- [x] Custom auto-pricing (per the human): AI basis pick in `src/lib/ai/parse.ts` (`costBasis`, custom `areaM2` hint) → `BuildListItem.customPricing` → component; engine fallback `autoPricing()` in `src/engine/templates/custom.ts` (name match, else `site_landscaping`), flag `custom_auto_priced`
- [x] Construction time from real data (per the human): `scripts/fetch-durations.ts` → `construction-durations.json`; `src/engine/duration.ts`; `Estimate.schedule`, `ComponentEstimate.durationMonths`; Construction time card in the Estimate tab; reports
- [x] Real road/park prices and overrun reference (per the human): `scripts/build-real-prices.ts` (Alberta UPA, Orangeville DC study), `scripts/build-overrun-reference.ts` (Flyvbjerg 2002, HM Treasury optimism bias); per-item `source`; severity colours on contingency/overrun cards
- [ ] P7.7 `/api/ai/narrative` with number check + template fallback; used in PDF · Stretch
- [ ] P8.1 Scenario create/duplicate/rename/delete · Stretch
- [ ] P8.2 What-if controls (date shift, price shocks, param changes, add/remove components) · Stretch
- [ ] P8.3 Comparison view (up to 3) · Stretch
- [ ] P8.4 Scenarios in exports · Stretch
- [x] P6.3 Site-context flags in engine + reports; auto-filled params (uses A's `/api/geo/context`) · Stretch
- [x] P7.6 Document upload (per the human): `src/components/questions/document-upload.tsx`, `src/lib/ai/extract.ts`, `/api/ai/extract`; review then apply as ai_document
- [x] General questions (per the human): one per type + param project-wide (`rank.ts`), group wording (`questions.groups`, `questions.askAll`), one Save for all listed
- [x] Site reviews + document-driven sizes and relayout (per the human): `src/engine/site-reviews.ts`, extraction `resizable` components, `DocumentUpload.relayout()` calls `generateLayout` with the same seed
- [x] Waterloo zone limits (per the human): `src/data/zoning/waterloo-rules.json` (38 zones, By-law 2018-050), `src/engine/zoning-limits.ts` (use, height, setbacks, coverage, landscaped open space)
- Request for A: after a document makes components bigger, `generateLayout` keeps the existing project area, so things can land outside it ("extends outside the project area"). Could the auto-picked area grow when the build list's sizes change?
- Note for A: per the human I removed the Colour by cost button from `view-switcher.tsx` (your file; store flag left in place, always off) and deleted `src/lib/export/_tmp_pdf.test.ts` (it wrote to your home folder and failed elsewhere).
- [ ] P9.6 Optional concept image provider (disabled without key) · Stretch

### S4 → S5 — Polish (after feature freeze)
- [-] P10.1 French translations (dropped: English only, SPEC 17)
- [ ] P10.4 Empty, loading, and error states (your areas)
- [ ] P10.6 `/data` page (all datasets incl. StatCan and CanadaBuys: source, date, licence, limits; BCPI trend chart)
- [ ] P10.7 Rehearse demo walkthrough with A (SPEC section 23); record video together

---

## Depends on Person A

- Scaffold and `store.ts` on `main` (S1).
- `measureComponent` / `measureProject` (by S2). Until then, test the engine with fixture measurements.
- Workspace layout mounting `<EstimatePanel/>` (S3), creation-flow navigation, landing page calling your parse endpoint.
- Map snapshot helper for the PDF (S4).
- Demo project geometry (S4).

## Feature map (your files)

| Feature | Key files | Notes |
| --- | --- | --- |
| Schemas (Project, Component, Geometry, Scenario, Measurements, Estimate, LineItem, Flag, reference data) | `src/lib/schemas/*.ts`, tests in `src/lib/schemas/__tests__/` | Import from `@/lib/schemas` (index re-exports all) |
| API route conventions (zod body validation, error format, per-IP rate limiter) | `src/lib/api/` (`route.ts`, `errors.ts`, `rate-limit.ts`, `api.test.ts`) | Import from `@/lib/api`; shared with A's `/api/geo/*` routes |
| Market evidence card (Altus benchmark, StatCan trend, CanadaBuys) and estimate charts | `src/lib/estimate/evidence.ts` (+ test), `src/components/estimate/market-evidence-card.tsx`, `charts.tsx`, `src/data/altus-benchmarks.json` | Evidence never feeds the engine |
| Site flags + road auto-fill from OSM | `src/engine/site.ts` (+ `__tests__/site.test.ts`), `setSiteContext` in `projectSlice.ts` | Uses A's `/api/geo/context` |
| Smart follow-up questions | `src/lib/questions/rank.ts`, `src/lib/ai/questions.ts`, `src/app/api/ai/questions/route.ts`, `src/components/questions/` | Questions tab in the panel |
| Zoning (MVP: live zone lookup, Waterloo + Cambridge + Ottawa) | `src/lib/zoning/`, `src/app/api/zoning/route.ts`, `src/engine/zoning.ts` (+ test), `src/lib/schemas/zoning.ts` | Advisory flags only |
| Custom element pricing (matched incl. Altus building rates / own rate) | `src/components/estimate/custom-pricing-form.tsx`, `src/engine/templates/custom.ts` | In the Inputs tab |
| Project files (download/open `.pwcost.json`) | `src/lib/project-file.ts` (+ test), `src/components/project-file/project-file-buttons.tsx` | A mounts the buttons |
| Project store slice (project meta, settings, scenarios, param/override helpers) | `src/lib/store/projectSlice.ts` (+ test) | `selectProject(state)` gives the full `Project` |
| Seed data (sample prices, SPEC 8) | `src/data/*.json`, loaded and validated in `src/data/index.ts` (+ `__tests__/seed-data.test.ts`) | `import { refData } from "@/data"` for the engine (or each file by name); 22 Ontario regions, 28 overrun reference entries (lognormal, mu set so P(factor > 1) = probabilityOfOverrun); 102 unit-price items, 11 building subtypes, 17 park feature kinds, 16 structure items, priceYear 2025; mobilization is a % in the engine, not a unit price |
| StatCan BCPI (real data) | `scripts/fetch-statcan-bcpi.ts` → `src/data/public/statcan-bcpi.json`; schema `src/lib/schemas/public-data.ts`; tests `src/data/__tests__/public-data.test.ts` | `pnpm data:bcpi`; Statistics Canada Open Licence |
| CanadaBuys awards (real data, evidence only) | `scripts/fetch-canadabuys.ts` → `src/data/public/canadabuys-awards.json`; schema in `src/lib/schemas/public-data.ts` | `pnpm data:canadabuys`; `pnpm data:refresh` runs all public data scripts; OGL-Canada |
| Cost engine: component templates | `src/engine/types.ts`, `params.ts`, `text.ts`, `index.ts` (`computeEstimate`), `escalation.ts`, `rng.ts`, `templates/*.ts`; tests in `src/engine/__tests__/` | Pure TS, SPEC 6–7 |
| Northgate fixtures (sample project + estimate for A's views) | `src/lib/fixtures/` | `import { northgateProject, northgateEstimate } from "@/lib/fixtures"` |
| Estimate panel + scope selector (whole project / one component), Estimate tab (range bar, class + hints, contingency, overrun risk), flags list, Line items tab (editable overrides), Inputs tab (params + source badges) | `src/components/estimate/estimate-panel.tsx`, `estimate-tab.tsx`, `flags-list.tsx`, `line-items-tab.tsx`, `inputs-tab.tsx`, `number-input.tsx`, `tabs.test.tsx`, `src/lib/estimate/scope.ts` (+ test), `useEstimate.ts` | Scope follows the shared selection |
| AI provider + prompt parse (build list) | `src/lib/ai/` (`provider.ts`, `gemini.ts`, `parse.ts` + test, `index.ts`), `src/app/api/ai/parse/route.ts`, `src/lib/schemas/draft.ts` | No key → keyword fallback |
| Build list review (creation flow step 2) | `src/components/build-list/` | A mounts it in P7.4 |
