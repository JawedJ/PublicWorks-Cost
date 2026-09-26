# PublicWorks Cost — Product & Build Specification

This file is the master specification for the app. Build it **phase by phase** (see "Build phases" near the end). Do not try to build everything at once.

Progress is tracked task by task in `PROGRESS.md` (task ids like `P1.4`); `CLAUDE.md` defines the workflow. When this spec leaves a detail open, make a sensible choice, keep it simple, update this file, and add a line to the Change log (section 25).

---

## 1. Product summary

PublicWorks Cost is a map-based, AI-assisted cost estimating web app for Canadian public infrastructure. A user describes the whole build in one plain-language prompt, lays out every part of it on a map, answers a few smart follow-up questions across all components, and gets a transparent, data-backed estimate with cost ranges, overrun risk, cost drivers, flags, visuals, scenarios, and exportable reports.

**A project is a combination of components.** One project can contain any number of roads, parks, buildings, and structures in the same general area, including several of the same type (e.g. a new neighbourhood hub with two new streets, a park, a library, a fire station, and a culvert). Each component is drawn and estimated on its own, and the project rolls everything up into one combined estimate.

**Primary users:** municipal engineers and project managers, engineering consultants, contractors bidding public work, and councils/the public (read-only viewers).

**Initial focus:** Ontario municipalities. Four component types, freely combined within a project:

1. **Roads & utilities** (road reconstruction/resurfacing, sidewalks, cycling lanes, watermains, storm and sanitary sewers) — drawn as a line.
2. **Parks & public spaces** (parks, playgrounds, splash pads, sports fields, trails, parking, washroom buildings) — drawn as a polygon with features placed inside.
3. **Public buildings** (community centre, library, fire station, police station, municipal office; school and hospital as rough, high-uncertainty types) — drawn as a site polygon + building footprint + storeys.
4. **Point structures** (culvert replacement, small bridge, pumping station) — drawn as a pin.

**Context:** this is being built for a hackathon pitch, but it must be a real, well-built product: every feature below is in scope. Avoid over-engineering (no microservices, no queues, no custom auth, no premature abstractions), but do not cut features or fake core functionality.

---

## 2. Core principles (apply everywhere)

1. **AI interprets, code calculates.** The AI converts text and documents into structured data, chooses which questions to ask, and writes narrative text. It never produces cost numbers. All quantities, prices, totals, ranges, and risk come from the deterministic cost engine.
2. **Every number is traceable.** Each line item shows its quantity source (e.g. "from drawn line: 812 m") and price source (e.g. "Sample Ontario unit price, 2025, typical"). Users can override any quantity or price, and overrides are visibly marked.
3. **The map is a primary input.** Drawn geometry is measured live and drives quantities. Editing or resizing a shape immediately updates measurements and the estimate.
4. **Prompt first, then design on the map.** The user starts with one general description of the whole build; the app turns it into a build list of components; the user then draws each one on the map. Everything after that (questions, estimate, visuals, scenarios, exports) works on the combined project.
5. **Unlimited creative freedom.** Users can design any shape, layout, or combination: any footprint, any number of sections and heights, any park layout, any road path, and elements the catalog doesn't know. The app never forces fixed blocks. Anything the app places for the user is **procedurally generated from the user's own idea** (their prompt, parameters, and drawn shapes) and is always fully editable. The estimate adapts to whatever is designed, and becomes less certain (wider range) where the design goes beyond known cost data rather than refusing it.
6. **Honest uncertainty.** Estimates are always shown as ranges (P10 / P50 / P90) tied to an estimate class, never as a single confident number.
7. **Sample data is labelled.** All seed pricing and reference data is illustrative. The UI and every export carry a clear "sample data" notice until real data is loaded.
8. **Built for Canada.** Metric units first (with ft² / ft shown alongside areas and lengths), CAD currency, Canadian regional factors, winter construction. English only (French dropped, see section 17).
9. **Demo reliability.** The app must work smoothly in a live pitch: preloaded demo projects, graceful fallbacks when external services (AI, map snapping, site lookups) fail or are slow, and no dead ends.

---

## 3. Tech stack

Use current stable versions. Check official docs for current APIs rather than relying on memory.

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript (strict) |
| Package manager | pnpm |
| Styling / UI | Tailwind CSS + shadcn/ui, lucide-react icons |
| Client state | Zustand (project editing state), React Query or SWR only if clearly needed |
| Validation & shared types | zod (schemas shared by AI outputs, API routes, engine, project files) |
| Map | MapLibre GL JS |
| Basemap tiles & geocoding | MapTiler (API key via env) — fallback to OpenFreeMap tiles if no key |
| Drawing | Terra Draw (MapLibre adapter) |
| Geometry / measurement | Turf.js |
| Road snapping | OSRM routing (public demo server by default, configurable URL), called via a server route with caching and timeout |
| Site context | OpenStreetMap Overpass API via a server route with caching and timeout |
| 3D | three.js via React Three Fiber + drei (component viewer); MapLibre fill-extrusion (buildings on map) |
| Charts | Recharts |
| AI | **Pluggable provider** selected by env `AI_PROVIDER`: `gemini` (default, Google AI Studio free tier via the `@google/genai` SDK), `anthropic` (`@anthropic-ai/sdk`), or `none` (deterministic fallbacks only). Server-side only. Structured output via each provider's JSON-schema / tool-use feature, with schemas derived from zod. Model names come from env vars (see section 20) so they can be changed without code changes |
| Persistence | **None.** No database, no file storage, no login. The project lives in browser memory for the session (see section 15) |
| PDF reports | @react-pdf/renderer |
| Excel export / import | SheetJS (`xlsx`) |
| i18n | next-intl (English only; `fr` plumbing left in place, unused) |
| Public data | Statistics Canada Building Construction Price Indexes (table 18-10-0289-01) and CanadaBuys award/tender notices (open.canada.ca CSV feeds), fetched by build-time scripts into committed JSON (section 8.1) |
| Tests | Vitest (engine, geometry, parsers); a light Playwright smoke test at the end is optional |
| Deployment | Vercel |

No login, no database, no ORM. Server routes are stateless: they receive what they need in the request and return results.

---

## 4. Architecture overview

```
Browser (Next.js client components)
  ├─ Map workspace (MapLibre + Terra Draw + Turf)  → live measurements
  ├─ Project store (Zustand)                         → geometry, params, scenarios
  ├─ Cost engine (pure TS, runs client-side for instant updates)
  └─ UI panels, charts, 3D viewer

Next.js server routes (/app/api/*)
  ├─ /api/ai/*              parse, questions, extract, narrative (AI provider: Gemini by default)
  ├─ /api/geo/snap          OSRM road snapping (cached)
  ├─ /api/geo/context       Overpass site context (cached)
  └─ /api/export/*          PDF + Excel generation
```

The cost engine is a pure TypeScript module in `src/engine` with no React, no network, and no randomness except through an injected seeded RNG. It runs on the client for instant recalculation and on the server for exports, producing identical results.

### Suggested folder structure

```
src/
  app/
    [locale]/
      page.tsx                     landing: whole-build prompt, blank map option, demo projects, open project file
      workspace/page.tsx           main workspace (current in-memory project)
      data/page.tsx                data sources & sample-data explainer
    api/...
  components/
    map/  estimate/  questions/  scenarios/  visuals/  reports/  ui/
  engine/
    templates/  (road.ts, park.ts, building.ts, structure.ts — one module per component type)
    project.ts   (roll-up across components, cross-component checks)
    pricing.ts  risk.ts  montecarlo.ts  drivers.ts  flags.ts  class.ts  tax.ts  index.ts
    __tests__/
  data/
    unit-prices.json  building-costs.json  park-features.json  structures.json  typologies.json
    regional-factors.json  overrun-reference.json
    demo-projects/*.json
    public/        (generated by scripts, committed: statcan-bcpi.json, canadabuys-awards.json)
  lib/
    ai/  geo/  i18n/  export/  schemas/  project-file/  utils/
  messages/ en.json  fr.json
scripts/
  fetch-statcan-bcpi.ts   fetch-canadabuys.ts   (run with `pnpm data:refresh`)
```

---

## 5. Data model

Define these as zod schemas in `src/lib/schemas` and infer TypeScript types from them.

### Project

```ts
Project {
  schemaVersion: number
  id: string (uuid)
  name: string
  description: string              // the original general prompt for the whole build
  municipality: string             // display name
  region: RegionKey                // drives regional factor
  location: { lng: number, lat: number, zoom: number }
  areaBoundary?: Feature<Polygon>  // optional outline of the general project area
  components: Component[]          // any number, any mix of types
  settings: { startDate: string, durationMonths: number, escalationRate: number, taxRate: number, contingencyMode: 'recommended' | 'manual', manualContingencyPct?: number, locale: 'en' | 'fr' }
  scenarios: Scenario[]            // baseline is scenarios[0]
  activeScenarioId: string
  siteContext?: SiteContext        // looked up once for the whole project area
  documents: { name: string, pageCount?: number, extractedAt: string }[]   // metadata only; file contents are never stored
  createdAt, updatedAt
}
```

### Component

```ts
Component {
  id: string
  name: string                     // e.g. "Maple Street", "North Park", "Branch library"
  type: 'road' | 'park' | 'building' | 'structure' | 'custom'
  subtype: string                  // e.g. 'road_reconstruction', 'community_centre', 'culvert_replacement'
  status: 'planned' | 'drawn'      // 'planned' = from the prompt's build list, not drawn yet
  origin: 'user' | 'generated'     // 'generated' = placed by the procedural layout; becomes 'user' once edited
  geometry?: ComponentGeometry     // absent while planned
  params: Record<string, ParamValue>   // answers to this component type's parameters
  paramMeta: Record<string, { source: 'default' | 'user' | 'ai_prompt' | 'ai_document' | 'site_context', evidence?: string }>
  overrides: { quantities: Record<lineItemId, number>, unitPrices: Record<lineItemId, number> }
  startOffsetMonths?: number       // optional phasing relative to project start
  visible: boolean                 // map/3D visibility toggle
}
```

Planned (undrawn) components appear in the build list but contribute no cost until drawn; the estimate clearly says how many components are still undrawn.

### Geometry

Store as GeoJSON (WGS84) plus role tags.

```ts
ComponentGeometry {
  primary: Feature<LineString | Polygon | Point>        // road path, park/site boundary (any shape), structure pin, custom element shape
  sections?: BuildingSection[]                          // buildings: one or more footprint sections, each with its own height
  features: PlacedFeature[]                             // park features, parking areas, trails, plazas, etc. (any shape)
}
BuildingSection {
  id: string
  footprint: Feature<Polygon>                           // any polygon: L-shapes, curves (approximated), courtyards (holes allowed)
  storeys: number                                       // sections can differ, e.g. a 2-storey wing and a 6-storey tower
  floorHeightM?: number
  roof: 'flat' | 'pitched' | 'green'                    // affects rendering and cost
  use?: string                                          // optional label, e.g. 'gym', 'library stacks', 'residential'
}
PlacedFeature {
  id: string
  kind: string                                          // a known kind (e.g. 'playground', 'splash_pad', 'sports_field', 'trail', 'parking', 'washroom') or 'custom'
  customLabel?: string                                  // for custom features, e.g. 'skate park', 'community garden', 'amphitheatre'
  geometry: Feature<Point | LineString | Polygon>
  params: Record<string, ParamValue>                    // e.g. playground size tier, field surface
}
```

### Measurements (derived per component, never stored as truth)

```ts
Measurements {
  lengthM?: number
  areaM2?: number
  perimeterM?: number
  footprintM2?: number
  grossFloorAreaM2?: number
  features: Record<featureId, { lengthM?: number, areaM2?: number }>
}
ProjectMeasurements { components: Record<componentId, Measurements>, totals: { roadLengthM, parkAreaM2, buildingGfaM2, areaBoundaryM2? } }
// Measurements also carries sections?: Record<sectionId, { footprintM2, perimeterM, grossFloorAreaM2 }> for buildings
```

### Scenario

```ts
Scenario {
  id, name, notes?
  componentOverrides: Record<componentId, { params?: Record<string, ParamValue>, geometry?: ComponentGeometry }>
  addedComponents: Component[]     // components that exist only in this scenario
  removedComponentIds: string[]    // baseline components excluded in this scenario
  shocks: { asphalt: number, concrete: number, steel: number, pipe: number, lumber: number, labour: number }  // % change, default 0
  startDateOverride?: string
}
```

### Persistence

There is no database. The `Project` object above is the complete state of a project; it lives in the Zustand store for the browser session and can be downloaded as a project file (section 15). Include a `schemaVersion` field so project files can be validated and migrated later.

---

## 6. Component types

A project contains any number of components of these types, in any combination and with any number of each. **All geometry is freeform**: every shape can be drawn, reshaped, rotated, and resized without limits. Costs are derived from measurements of whatever is drawn (length, area, perimeter, storeys), so any shape works. Each component type is a module (in `src/engine/templates`) that exports:

- `id`, `subtypes`, display names (EN/FR)
- `drawing`: which geometry the user draws and which placed features are allowed
- `paramCatalog`: every parameter the component type understands, each with `id`, label (EN/FR), type (`number | enum | boolean`), unit, default, allowed range/options, **`costImpact` score (1–5)** and a short **"why it matters"** text (EN/FR). The AI may only ask about or fill parameters from this catalog.
- `deriveQuantities(geometry, measurements, params) → QuantityLine[]` — each with `lineItemId`, quantity, unit, and a human-readable `quantitySource` explanation.
- `flags(params, siteContext, measurements, settings) → Flag[]`

**Cross-component checks** (engine level, not per type) are advisory only and never block a design: overlapping building footprints, a building footprint overlapping a road line's width buffer or a park feature, park features outside their park, components outside the optional area boundary, and a structure pin not on or near a road or watercourse. These produce warnings, never errors.

**Relationships between components** are kept simple: components are independent for costing. The only shared effects are project-level ones in section 7 (one mobilization/traffic management allowance per project phase, shared site context, and correlated price shocks).

Quantities must be derived with clear, documented rules. The rules below are the starting point; keep them in the component type modules with comments.

### 6.1 Roads & utilities (line)

Subtypes: `road_reconstruction`, `road_resurfacing`, `sidewalk_cycling`, `watermain_replacement`, `sewer_replacement`.

Key parameters: lanes, lane width (default 3.5 m), parking lanes, road class (local / collector / arterial), existing pavement type, scope toggles (full reconstruction vs mill & pave, curbs, sidewalks one/both sides + width default 1.8 m, cycling lanes/cycle track, watermain + diameter + material, storm sewer + diameter, sanitary sewer, streetlighting), excavation depth, soil condition (good / average / poor / unknown), rock expected, traffic staging (full closure / staged / night work), utility conflicts expected, services per 100 m.

Derivation examples (L = drawn length):
- Road width W = lanes × lane width + parking lanes × 2.4 m.
- Pavement area = L × W; excavation volume = area × depth; granular base/subbase volumes by depth params; asphalt tonnes = area × thickness × density (2.4 t/m³).
- Curb and gutter = L × sides; sidewalk area = L × width × sides.
- Watermain length ≈ L; hydrants = ceil(L / 150); water services ≈ (L / 100) × servicesPer100m; valves every 250 m.
- Storm sewer length ≈ L; catch basins = ceil(L / 60) × 2; maintenance holes = ceil(L / 100).
- Traffic control: lump sum per month × duration × staging multiplier.
- Restoration (sod/boulevard) = L × boulevard width × sides.

### 6.2 Parks & public spaces (polygon + placed features)

Subtypes: `neighbourhood_park`, `community_park`, `plaza`.

The park boundary (any shape) gives area A and perimeter. Features can be points, lines, or polygons of any shape and size, placed anywhere in the park. Known feature kinds:
- `playground` (point, size tier: small/medium/large, accessibility level)
- `splash_pad` (point, size tier)
- `sports_field` (polygon, surface: natural/artificial turf, lighting yes/no)
- `trail` (line, width, surface: granular/asphalt, lighting yes/no)
- `parking` (polygon, surface)
- `washroom` (point, floor area)
- `shade_structure`, `seating_area` (point)
- `tree_planting` (polygon, density per ha) and general tree count parameter
- `plaza` / hardscape (polygon, surface)
- `custom` feature: any name the user types (e.g. skate park, community garden, amphitheatre, dog park), drawn as any shape, priced as described in 6.5.

Derivation examples:
- Grading = A; topsoil + sod/seed = A − hardscape − feature areas; irrigation (optional) on turf area.
- Trail quantities = trail length × width; lighting poles = ceil(length / 30).
- Fencing (optional) = perimeter × fence fraction param.
- Site furniture allowance scales with A.
- Each point feature priced as a unit by tier from `park-features.json`.

### 6.3 Buildings (freeform sections + storeys)

Subtypes: public buildings `community_centre`, `library`, `fire_station`, `police_station`, `municipal_office`, `school` (rough), `secondary_school` (rough), `hospital` (rough), `ice_arena`, `aquatic_centre`, `performing_arts`, `museum_gallery`, `medical_clinic`, `maintenance_facility`; and public/affordable housing `house` (single-detached), `townhouse_block`, `low_rise_apartment`, `mid_rise_apartment`.

A building is one or more **sections**, each a freeform footprint with its own storeys and roof type, so users can design anything from a simple box to an L-shaped library with a taller wing, a courtyard school, or a stepped apartment building. Sections can be drawn directly, or **procedurally generated** from the building's type and size (see section 11) and then freely edited. The site polygon is optional: if not drawn, a site is generated as the combined footprint plus a default setback buffer for site-work quantities.

Parameters: storeys, GFA override, quality level (basic / standard / high), sustainability target (code minimum / high performance / net-zero ready), basement yes/no, special spaces (e.g. gym, pool for community centre; apparatus bays for fire station), parking stalls or drawn parking polygon, demolition of existing building, site servicing complexity, FF&E included.

Derivation:
- GFA = Σ (section footprint area × section storeys) (unless overridden).
- **Shape complexity factor**: envelope-related cost scales with the perimeter-to-area ratio of each section compared with a rectangle of equal area, and with the number of distinct sections/heights (more corners and wall per m² cost more). Keep the factor modest and visible as its own line item so users see the cost of complex forms.
- Pitched and green roofs add a roof premium per m² of roof area.
- Building cost = GFA × base $/m² for subtype (low/typical/high from `building-costs.json`) × quality factor × sustainability premium + special space premiums.
- Site works: parking area (drawn or stalls × 30 m²), landscaping = site area − footprint − parking, servicing lump by complexity, demolition by existing GFA.
- Soft costs added in the engine (see 7.5).
- `school` and `hospital` must produce a visibly wider uncertainty band and a flag explaining that cost depends mostly on the internal program, not floor area.

Show a live check: does the footprint + parking fit inside the site polygon? Flag if not. Several buildings can share one area; each building component has its own site polygon (which may be drawn tightly around the footprint when there is no separate lot).

### 6.4 Structures (pin or drawn shape)

Subtypes: `culvert_replacement`, `small_bridge`, `pumping_station`.

Parameters: for culverts: span/diameter, length, material, depth of cover, road class, watercourse (fish habitat yes/no); for small bridges: deck length and width (deck area), structure type; for pumping stations: capacity tier.

Derivation: unit-based pricing from `structures.json` plus traffic control, in-water work allowance and permit flags. A bridge can also be drawn as a line (span) with a width parameter, giving deck area from the drawing.

### 6.5 Custom elements (anything the catalog doesn't know)

Users can add a **custom component** or a **custom park feature** for anything: a skate park, amphitheatre, public art installation, boardwalk, retaining wall, outdoor rink, and so on. They name it, draw it as any shape (point, line, or polygon), and choose how it's priced:
- **Matched:** the app suggests the closest known cost basis (a keyword match from the name today, e.g. "community pool" → aquatic centre; the AI may later propose a match from the name, e.g. "boardwalk → trail, timber surface, premium"; the user confirms), priced per m², per m, or per unit from seed data, with a wider uncertainty band. Bases include every building rate (real Altus 2026, per m² of the drawn area), park features, and unit prices.
- **Own rate:** the user enters a rate per m², per m, per unit, or a lump sum, with optional low/high values.

Custom elements are always marked in the estimate as lower-confidence, carry wider ranges in the Monte Carlo, and lower the component's estimate class. They are never blocked.

---

## 7. Cost engine

Input: `Project` (with active scenario applied) + measurements + reference data. Output: `Estimate`, containing both the **combined project** figures and a **per-component** breakdown.

Order of calculation: derive quantities and price line items **per component** → sum to component direct costs → add **project-level** items (soft costs, escalation, taxes) → run **one Monte Carlo over all line items of all components together** so shared price shocks correlate across components → report combined and per-component results.

```ts
Estimate {
  components: {
    componentId, name, type, directCost,
    p10, p50, p90,                      // component-level results from the same simulation
    estimateClass, share               // share of project P50
  }[]
  undrawnComponents: number
  lineItems: LineItem[]                 // each tagged with componentId; grouped by component then category
  subtotals: Record<category, number>
  directCost: number
  softCosts: { engineering, contractAdmin, permitsApprovals, projectManagement, ffe? }
  escalation: number
  taxes: number
  baseEstimate: number                  // before contingency
  estimateClass: 'D' | 'C' | 'B' | 'A'
  classRange: { lowPct, highPct }
  distribution: { p10, p50, p80, p90, histogram: {bin, count}[] }
  recommendedContingency: { amount, pct }
  overrunRisk: { probabilityOfOverrun, typicalOverrunPct, referenceNote }
  drivers: { id, label, impactLow, impactHigh }[]     // tornado data
  flags: Flag[]
  perUnitMetrics: { perM?, perM2?, perM2GFA? }
  sampleData: boolean
  computedAt: string
}
LineItem {
  id, componentId (null for project-level items), elementRef?: { sectionId?, featureId? }, category, description, quantity, unit, quantitySource,
  unitPrice: { low, typical, high }, unitPriceSource, priceCategory (asphalt|concrete|steel|pipe|lumber|labour|general),
  total, isQuantityOverridden, isPriceOverridden, lowConfidence
}
```

### 7.1 Pricing
- Unit price (typical) × regional factor × escalation to construction midpoint × scenario shock for the item's price category.
- Custom elements: matched or user-entered rates (section 6.5); if no low/high given, apply a default wide band (e.g. −30% / +60%, configurable). User-entered rates get the source label "User-entered rate".
- Regional factors from `regional-factors.json` (sample values for Ontario municipalities, including northern and fly-in communities with much higher factors).
- Escalation, in two parts, both deterministic code:
  1. **Price year → today (building components):** scale by the ratio of the Statistics Canada Building Construction Price Index for the latest published quarter to the index for the seed data's price year (section 8.1), using the matching building type where available (e.g. non-residential/institutional) and the chosen reference CMA. Show this as its own line in the calculation ("StatCan BCPI, Toronto, non-residential: +X% since 2025 Q2").
  2. **Today → construction midpoint (all components):** compound `escalationRate` to the midpoint of each component's construction window (project start + `startOffsetMonths`). The default rate is the **trailing 8-quarter annualized change** of the reference BCPI series (falls back to 4%/yr if data is missing); editable.
  - Road, park, and structure items have no official StatCan building index; they use the non-residential series as a **labelled proxy** for step 1, or skip step 1 when their unit prices are already current. Label proxies clearly in the UI.

### 7.2 Season
If construction overlaps December–March, apply a winter premium to earthworks, concrete, and paving items (configurable, default 8%) and add a flag. If paving is scheduled in winter, flag that paving is typically deferred to spring.

### 7.3 Estimate class
Compute per component from an **input completeness score**: weighted share of high-impact parameters answered by the user, extracted from documents, or confirmed from site context (vs left as default), plus a bonus for uploaded documents. Map score → class D/C/B/A. Class ranges (defaults, clearly labelled as illustrative and editable in data): D −30%/+50%, C −20%/+30%, B −15%/+20%, A −10%/+15%. Show the user which answers would raise the class. The **project class** is the cost-weighted combination of component classes (rounded toward the less certain class), so one poorly defined expensive component lowers the whole project's class.

### 7.4 Risk: Monte Carlo + reference class overrun
- Seeded Monte Carlo (5,000 iterations; fast enough to run client-side on every change with debouncing; use a Web Worker if needed).
- Each line item varies by a triangular distribution over its low/typical/high unit price.
- Price categories share correlated shocks (items in the same category move together).
- Apply an overrun factor **per component**, sampled from `overrun-reference.json` for that component's type, subtype and estimate class (lognormal parameters plus probability of overrun). Seed values should reflect published research patterns: routine road work has roughly half of projects over budget with average escalation in the single digits, buildings and complex projects higher, and early-stage (Class D) estimates carry much more overrun than late-stage ones. Label as sample.
- Outputs: project P10, P50, P80, P90, histogram, probability of exceeding the base estimate, plus per-component P10/P50/P90 from the same iterations (component percentiles do not sum to project percentiles; show that note in the UI).
- Recommended contingency = P80 − base estimate (floored at 5% of base).

### 7.5 Soft costs and taxes
- Engineering/design %, contract administration %, permits & approvals allowance, internal project management % — defaults per component type, applied per component, editable.
- One **mobilization and general conditions** allowance per project (not per component), scaled to total direct cost, so combining components in one project is slightly cheaper than pricing them separately; show this line explicitly.
- Taxes: a single configurable "net HST after municipal rebate" rate, with a tooltip explaining it's a simplification.

### 7.6 Cost drivers
Tornado analysis: vary each price category and each high-impact parameter of each component between low/high bounds and record the change in project P50. Show the top 8, labelled with the component name where relevant (e.g. "Library — quality level").

### 7.7 Flags
Flags have severity (info / warning / high), title, explanation, and optional cost effect. Sources: site context (waterway within 30 m → conservation authority permit and in-water work timing; rail line within 30 m → railway approval; school or hospital within 200 m → traffic management and work-hour limits; floodplain sample layer), parameters (poor soils, rock, utility conflicts), season, building fit on site, zoning limits (section 8.3), hospital/school uncertainty, missing high-impact inputs, undrawn components, and the cross-component checks in section 6. Every flag names the component(s) it applies to.

### 7.8 Tests
Vitest coverage for: each component type's quantity derivation, multi-component roll-up (including several components of the same type), per-component vs project percentiles, cross-component checks, multi-section buildings and shape complexity, custom elements (matched and user-entered rates), scenario add/remove of components, pricing with regional factor and escalation, class calculation, Monte Carlo determinism with a fixed seed, contingency, drivers, winter logic, and overrides.

---

## 8. Seed data

All in `src/data`, JSON, validated by zod at load. Every file has `meta: { sample: true, priceYear, notes }`.

- `unit-prices.json`: ~80–120 civil items (excavation, granular A/B, asphalt HL3/HL8, concrete curb, sidewalk, watermain by diameter, hydrant, valve, water service, storm/sanitary pipe by diameter, catch basin, maintenance hole, traffic control, sod, topsoil, trees, streetlights, trail surfaces, fencing, etc.) with id, description EN/FR, unit, low/typical/high CAD, priceCategory.
- `building-costs.json`: $/m² low/typical/high by building subtype, quality factors, sustainability premiums, special space premiums. **Base rates per subtype are real:** Altus Group 2026 Canadian Cost Guide (pp. 5–6), average of the GTA and Ottawa ranges, converted from $/sq ft, with price year 2026 and a per-subtype `source` shown on the line item. Quality factors, premiums, and special spaces stay sample.
- `park-features.json`: unit costs by feature and tier.
- `typologies.json`: **inputs for procedural generation and rendering, not fixed shapes.** For each building subtype and park feature kind: typical GFA range and default, typical storeys, floor height, typical footprint proportions, typical site coverage, roof default, colour/pattern style, and icon id; for park features, typical size ranges (e.g. splash pad 150–600 m², full-size soccer field 105 × 68 m); for roads, lane and boulevard defaults. Icons are original, simple top-down SVGs created for this project (no third-party icon art).
- `structures.json`: culverts by size and material, bridge $/m² deck, pumping station tiers.
- `regional-factors.json`: Ontario regions/municipalities, including northern and remote (fly-in) factors.
- `overrun-reference.json`: per component type/subtype and class: probability of overrun, lognormal mu/sigma, and a plain-language note describing the evidence pattern.
- `demo-projects/`: three complete demo projects (see section 16).

### 8.1 Public data sources (real, not sample)

Two official Canadian open datasets are pulled by **build-time scripts**, filtered, and saved as small JSON files committed to the repo. The app never calls these services at runtime, so the demo stays fast and reliable and needs no database. `pnpm data:refresh` re-runs the scripts. Each output file records its source URL, table or dataset ID, retrieval date, and licence (Open Government Licence – Canada), shown on the `/data` page and in exports.

**Statistics Canada — Building Construction Price Indexes (BCPI), table 18-10-0289-01** → `src/data/public/statcan-bcpi.json`
- Quarterly indexes (2023 = 100) of contractors' prices for residential and non-residential building types, by CMA; includes materials, labour, equipment, overhead and profit, excluding taxes and land.
- Fetch the full-table CSV (or use the Statistics Canada Web Data Service REST API), then keep only: the non-residential and residential building-type series needed, the "total" division (and major divisions if easy), for Ontario CMAs published in the table plus the composite, last ~20 quarters.
- The table covers 15 CMAs and **Kitchener–Cambridge–Waterloo is not one of them.** Use a configurable **reference CMA** per region in `regional-factors.json` (default for Waterloo Region: Toronto, with London as an alternative) and label it in the UI ("Index: Toronto CMA, nearest published").
- Used by the engine for escalation (section 7.1) and shown in a small **cost trend** chart on the `/data` page and in the Estimate tab's assumptions.

**CanadaBuys — award notices and tender notices (Public Services and Procurement Canada)** → `src/data/public/canadabuys-awards.json`
- Official federal procurement open data, refreshed daily as CSV. Download the current and previous fiscal-year award notice files (and optionally open tender notices).
- Read the CanadaBuys data dictionary for exact column names rather than guessing. Filter to construction-related notices (by category / UNSPSC / GSIN codes and title keywords such as paving, asphalt, road, bridge, culvert, sewer, watermain, roof, building, renovation, park) with a delivery/work location in Ontario. Keep: title, buyer, supplier, award date, contract value, region, category, notice URL.
- Limits to state in the UI: **federal projects only** (not municipal), and **contract totals, not unit prices**. These records are **evidence only** — they never feed the cost engine.

### 8.2 Market evidence card

In the Estimate tab, a **"Market evidence"** card shows real public data related to the selected scope, instantly, from the committed files:
- **Benchmark check:** each building's cost per sq ft (building only, and all-in) against the Altus Group 2026 range for its type, and each road's cost per metre against Altus's local/arterial road range (`src/data/altus-benchmarks.json`, not used by the engine), marked below / within / above.
- **Price trend:** "Construction prices for non-residential buildings (Toronto CMA) rose X% over the last 4 quarters (Statistics Canada, 2026 Q2)."
- **Comparable public contracts:** up to 3 CanadaBuys awards (most recent first) matched by keyword and category to the selected component types (e.g. a road → paving/road awards in Ontario), each with title, buyer, value, year, and a link to the notice.
- **Local tenders (optional):** entries from `src/data/public/municipal-tenders.json` if present (hand-curated or AI-extracted from public council reports, each with a source link and a "verified" flag); unverified entries are labelled.
- A footnote stating sources, dates, and that evidence informs judgement but doesn't change the estimate.

### 8.3 Zoning limits (real, advisory flags only)

> **MVP as built (2026-09-26):** zone lookup for **Waterloo** (By-law 2018-050: all 2,918 zone polygons snapshotted by `pnpm data:zoning` from the service behind the city's public map viewer into `src/data/public/waterloo-zoning.json`, simplified to ~2 m, looked up offline; `/api/zoning/map` serves the polygons in a box for a map layer), **Ottawa** (By-law 2008-250, `maps.ottawa.ca` Zoning MapServer layer 3) and **Cambridge** (By-law 150-85, the city's HybridZoningBylaw FeatureServer), one point query per drawn building via `/api/zoning` (config in `src/lib/zoning/sources.ts`, one entry per city). Kitchener publishes no zoning service and Toronto needs a script-built file, so those get "Zoning not checked". Waterloo's holding symbol "(H)" is flagged as a warning. Flags: the zone and by-law (with the by-law link where given), site-specific provisions, and an obvious use mismatch (e.g. a fire station in a residential zone). Limits (height, coverage, FSI, setbacks) are **not** transcribed yet; the rest of this section is the full design for later.

Buildings are checked against **real municipal zoning limits** in three Ontario cities: **Waterloo, Toronto, Ottawa**. Anywhere else, or if a lookup fails, the building gets an info flag: "Zoning not checked: no zoning data for this municipality." Zoning never blocks drawing and **never changes the estimate**; it only produces flags (section 7.7).

**Two parts per city:**
- **Zone map** (which zone applies where), from each city's open data:
  - Waterloo: City of Waterloo Open Data zoning layer (By-law 2018-050).
  - Toronto: Zoning By-law 569-2013 shapefiles on Toronto Open Data, including the **height overlay** (numeric height limits).
  - Ottawa: City of Ottawa zoning map service. Confirm which by-law is in force (2008-250 or its replacement, 2026-50) before transcribing.
  Where a city offers a point/area query service (ArcGIS REST), `/api/zoning` queries it at runtime for the project area, with cache, timeout, and the fallback flag above. Where it doesn't (Toronto), a script in `scripts/` simplifies the layer into committed JSON (keep it small; clip or simplify as needed).
- **Zone limits** (what each zone allows), hand-transcribed from the by-law text into `src/data/zoning/<city>.json`: per zone code, max height (m), max storeys, max lot coverage (%), max density (FSI), minimum front/side/rear setbacks (m), and permitted use categories (matched to building subtypes). Every value cites its by-law section and has a retrieval date. Cover the main zone families per city (residential, mixed-use, commercial, institutional, open space). Zones not transcribed get an info flag naming the zone and by-law ("Zone X: limits not loaded, check By-law ___"). Site-specific zones (e.g. Toronto exceptions) are flagged as site-specific, never guessed. Where a height overlay gives a numeric limit (Toronto), it takes precedence over the zone table.

**Checks (engine, pure):** for each building, find the zone(s) its sections fall in, then compare: tallest section height and storeys vs max; combined footprint / site area vs coverage; GFA / site area vs FSI; section distance to site boundary vs setbacks (only when a site is drawn); building subtype vs permitted uses. Each breach is a `warning` flag naming the component, the limit, the design value, the zone, and the by-law section, plus "Advisory: may need a minor variance or rezoning; verify with the municipality." Partial data → check only what's known.

**Data flow:** the lookup result is stored on the project as `zoningContext` (like `siteContext`, saved in the project file, with a demo snapshot for demo projects) so the engine stays network-free and deterministic.

**Limits to state in the UI and on the `/data` page:** hand-transcribed and advisory, main zones only, may lag recent amendments, not a building code review.

Create a `/data` page listing every dataset, what it contains, that it is sample data, and how real data would replace it (public tender results, published cost guides, municipal partners).

---

## 9. AI features

All AI calls go through server routes and a single provider interface in `src/lib/ai`:

```ts
interface AIProvider {
  generateStructured<T>(opts: { system: string, prompt: string, schema: ZodSchema<T>, documents?: { mimeType: 'application/pdf', data: Buffer }[], fast?: boolean }): Promise<T>
  generateText(opts: { system: string, prompt: string, fast?: boolean }): Promise<string>
}
```

Implementations: `GeminiProvider` (default), `AnthropicProvider`, `NoneProvider` (throws a typed "unavailable" error so callers use fallbacks). Feature code never imports a vendor SDK directly. Responses are validated with zod, retried once on validation failure, and time out gracefully. Never send API keys to the client.

**Free-tier awareness (Gemini):** the free tier has low per-minute and per-day request limits shared across the whole app. Therefore: keep calls to the minimum listed below (no AI calls on every keystroke or map edit), cache AI results per project input hash, rate-limit AI routes per client IP (simple in-memory counter), handle `429` rate-limit responses by switching to the fallback with a small non-blocking notice ("AI assistant busy, used standard questions"), and never send real or sensitive data (the free tier may use inputs to improve the provider's products; note this on the `/data` page).

**Every AI feature has a deterministic fallback** so the app still works if the API is unavailable or rate-limited (and demo projects include cached AI outputs).

### 9.1 Parse project prompt — `/api/ai/parse`
Input: the general prompt for the whole build, locale. Output: `ProjectDraft` — project name, municipality/region guess, start date guess, and a **build list**: every component mentioned (type, subtype, suggested name, count if the prompt says "two fire stations" or "three new streets"), plus any parameters clearly stated for each (only ids from that component type's catalog), including sizes (e.g. "2,400 m² library", "3-storey", "1.5 ha park", "400 m street") and spatial hints (e.g. "park next to the library", "fire station on the corner"), each with the phrase that supports it. Anything outside the catalog becomes a `custom` component or feature with its name preserved. Fallback: keyword matcher that detects component types and counts.

### 9.2 Smart follow-up questions — `/api/ai/questions`
Input: all drawn components with their params and sources, measurements, site context. Output: an ordered list of up to 8 questions **across the whole project**, each referencing a `componentId` and a catalog `paramId`, with suggested default, a one-sentence reason tailored to this project, and optional answer choices. Prioritize by cost impact × the component's share of project cost, so big-ticket components get asked about first. Where the same answer plausibly applies to several components (e.g. soil conditions for all roads), offer "apply to all similar components". The AI must skip parameters already known. Validate every `componentId` and `paramId`. Fallback: rank unanswered params by `costImpact` × component cost share.

### 9.3 Document extraction — `/api/ai/extract`
Input: uploaded PDF (geotechnical report, drawings, previous study). Send the PDF to the model as a document input through the provider interface. Output: parameter values from the catalogs, each assigned to the component(s) it applies to, with short evidence quotes and page numbers. Show the user a review screen to accept/reject each extracted value.

### 9.4 Report narrative — `/api/ai/narrative`
Input: the computed `Estimate` + project summary + locale. Output: executive summary, key risks, recommendation paragraphs for the council report, in English. The prompt must instruct the model to use only numbers present in the input. After generation, check that every number in the text appears in the input data (allowing formatting differences); if not, regenerate once, then fall back to a template-based narrative.

### 9.5 Concept render (optional, pluggable)
An optional "Concept image" feature behind an `IMAGE_PROVIDER` interface, disabled unless an image-generation API key is configured. Images are always labelled "Illustrative concept — not a design drawing." Do not block any other feature on this.

---

## 10. Screens and user flow

### 10.1 Landing (`/[locale]`)
- Large prompt box as the main entry point: "Describe what you want to build" with 3 example prompts as clickable chips, including at least one combined build (e.g. "A new neighbourhood hub: two new local streets with watermains and sewers, a 1.5 ha park with a playground and splash pad, a two-storey library, and a fire station").
- Smaller secondary option: "Start with a blank map".
- Demo projects (3 cards) that open instantly.
- "Open project file" button to load a previously downloaded project file.

### 10.2 Project creation flow

1. **Describe the whole build.** The user enters one general prompt covering everything they want to build.
2. **Review the build list.** The parse result appears as the project summary (name, municipality, start date) and a **build list** of components as editable cards: type, subtype, name, and any details picked up from the prompt, each with its source phrase. The user can edit, remove, duplicate, or add components before continuing.
3. **Locate.** The map opens; the user searches the municipality or address and the map flies there. Optionally the user outlines the general project area.
4. **Design on the map.** The build list stays visible beside the map as a checklist. The user can:
   - **Generate a starting layout** from their idea: the app procedurally places every planned component in the chosen area, sized from the prompt and typical values (section 11). "Regenerate" produces a different arrangement. Everything generated is fully editable.
   - **Design freely**: draw any shape for any component, reshape, rotate, resize, split buildings into sections with different heights, add any park features including custom ones, and add custom elements the catalog doesn't know.
   - Mix both: generate, then reshape to taste.
   Everything renders as a recognizable 2D plan generated from the actual shapes (not fixed icons or blocks). Planned components turn "drawn" with live measurements, and a compact running total updates as the design grows.
5. **Answer questions.** Smart follow-up questions across the whole project, grouped by component, each with a default, a reason, and "use default"; document upload drop zone.
6. **Estimate & visualize (one step).** The full workspace: the map/3D view and the estimate side by side and linked. Switch the view between 2D plan, 3D on map, and 3D site scene; click any element to see its cost; change anything and both the visuals and the numbers update together. Scenarios and exports are available from here.

Users can move back and forth freely. Undrawn components are shown as a reminder in the estimate and don't block anything.

### 10.3 Workspace (`/[locale]/workspace`)
Desktop layout: the **view** on the left (~60%) with the **component list** docked at its side, the estimate panel with tabs on the right. Mobile: view on top, panel below as a sheet.

**View switcher** (top of the view): **2D plan** (default while designing) · **3D map** (buildings extruded on the basemap) · **3D site** (three.js scene of all components). All three views share selection: selecting a component or element in any view, the component list, or a line item highlights it everywhere. A **"colour by cost"** toggle works in all three views. When a road is selected, its **cross-section** opens as a panel under the view.

**Linked cost inspection:** hovering an element shows a tooltip with its name, key measurement, and cost; clicking it filters the estimate panel to that component (and, where relevant, to its line items).

**Component list:** every component with type icon, name, status (planned/drawn), key measurement (e.g. 812 m, 1.6 ha, 2,400 m² GFA), P50 cost, and share of total; actions to select, zoom to, rename, duplicate, hide/show, and delete. Selecting a component highlights it on the map and in 3D.

**Scope selector** at the top of the right panel: **Whole project** (default) or a single component. All tabs respect it: e.g. the Estimate tab shows the combined figures with a per-component breakdown chart, or one component's own range, drivers, and flags. The scope **is** the shared selection (`selectedComponentId`): clicking a component on the map or in the list scopes the panel to it; "Whole project" (or clearing the selection) goes back. Kept simple: a plain dropdown, one component at a time, no multi-select or saved views.

Right panel tabs:
- **Estimate**: headline range (P10–P90 with P50 marked), per-component breakdown (stacked bar and table), market evidence card (section 8.2, collapsed by default), estimate class badge with "how to improve accuracy" hints, recommended contingency, overrun risk card, cost distribution chart, category breakdown, flags list ("Things to check": collapsed by default, scrollable, read-only), per-unit metrics.
- **Line items**: editable table grouped by component, then category (quantity, unit price, total, sources, override indicators, reset to calculated).
- **Inputs**: parameters of the selected component (or all, grouped by component), with source badges (Default / You / From prompt / From document / From site).
- **Site**: no separate tab or button; site context is looked up automatically in the background and appears as allowance line items and flags.
- **Scenarios**: list, create/duplicate, what-if sliders, side-by-side comparison.
- **Export**: PDF council report, Excel workbook, download project file.

A persistent top bar: project name (editable), "Download project file" button, "New project", language toggle, sample-data badge.

---

## 11. Map features (highest priority)

- MapLibre map with a clean basemap, satellite toggle if the tile provider supports it, geocoding search, scale bar, zoom controls.
- **Freeform design tools, no fixed shapes.** For any component or feature the user can draw with: polygon, rectangle, circle/ellipse, freehand (smoothed), line/polyline (with optional curve smoothing), and point. Available for buildings (and each building section), parks, park features, roads, trails, structures, custom elements, and the project area.
- **Add menu** listing every component type, building subtype, park feature kind, structure, and **"Custom…"** (name anything, draw it, choose how it's priced; section 6.5). Choosing an item starts drawing it, or fulfils the selected planned component from the build list. No limit on counts.
- **Smart start (procedural, optional):** when adding a known type, the user can click once to drop a **procedurally generated** starting shape sized from their prompt or parameters and `typologies.json` (e.g. a 2,400 m² two-storey library becomes a 1,200 m² footprint with proportions typical for libraries, oriented to the nearest street), instead of drawing from scratch. It's a normal freeform shape from then on.
- **Generate starting layout (procedural):** places all planned components at once inside the project area (or around the searched location): roads first (snapped to or aligned with existing streets where possible), then buildings fronting the roads with setbacks, then parks in remaining space, respecting spatial hints from the prompt ("next to", "on the corner") and avoiding overlaps. Deterministic with a seed; "Regenerate" changes the seed for a new arrangement. Layout logic is plain code, not AI; the AI only provides sizes and hints from the prompt.
- **Editing, without limits:** move, rotate (handle), scale (handles; Shift keeps proportions), edit vertices (add/remove/drag), add holes (courtyards), split a building footprint into sections and set each section's storeys and roof, merge sections, duplicate, mirror, delete, undo/redo. No size or shape limits; unusual values (e.g. a 40-storey library) only produce an advisory flag.
- **2D plan rendering (procedurally generated from the actual shapes, recognizable, not plain boxes)** while designing:
  - Buildings: each section's roof generated from its actual polygon (flat roofs with an inset parapet line and rooftop units; pitched roofs with ridge lines for simple shapes, falling back to flat styling for complex ones; green roofs with a planted texture), shading darker for taller sections, type colour, name label, and a storeys badge per section (e.g. "2F", "6F").
  - Parks: grass-textured fill of the drawn shape; trees **scattered procedurally** (seeded Poisson-disk) inside the park but outside features and paths; sports-field markings fitted to the drawn shape's orientation and size; parking stalls generated along the drawn lot; playground and splash pad styling generated to fill their drawn shapes; custom features shown with a neutral hatch and their name.
  - Roads: generated along any drawn path at true width in metres (from lanes and parameters), with lane markings, curbs, sidewalks, and cycle lanes offset from the centreline, shown as the user zooms in.
  - Structures: symbol at the pin (culvert, bridge, pump station) with a label.
  - The selected component is highlighted and editable; others stay visible but locked until selected.
- Terra Draw modes per component type:
  - Road: **line** mode (click start → intermediate points → end), plus **"Snap to streets"** toggle that routes between clicked points using OSRM via `/api/geo/snap`; falls back to straight segments if unavailable.
  - Park: **polygon** and **rectangle** for the boundary; a **feature palette** to place playgrounds, splash pads, washrooms (points), sports fields/parking/tree areas (polygons), trails (lines) inside the boundary; warn if a feature is placed outside.
  - Building: site **polygon/rectangle**, then **footprint** polygon/rectangle, storeys stepper; parking polygon optional.
  - Structure: **point** mode.
- **Select & edit**: click any component on the map (or in the component list) to select it; drag vertices, move shapes, delete, duplicate (offset copy for quickly adding similar buildings), undo/redo across all components.
- **Live measurements**: while drawing and editing, show a floating label on the shape and a measurements panel for the selected component: length (m, km, ft), area (m², ha, ft², acres), perimeter, footprint and GFA, plus project totals (total road length, park area, building GFA, project area). Units toggle metric/imperial (metric primary).
- **Live cost link**: measurement changes update the estimate within ~300 ms (debounced), with a subtle highlight on the changed total.
- **Cross-component warnings** (section 6) shown live as map markers while drawing.
- **Layers**: component geometry styled as above, flags as map markers. (Site context is not drawn on the map.)
- **3D on map** view: every building section extruded to its own height (storeys × floor height) with type colours; park features and roads remain as 2D plan styling on the ground; tilt/rotate enabled.
- Implementation guidance: generate render geometry client-side from the project store (Turf for insets, offsets, and point scattering; seeded RNG for scatter), then feed MapLibre GeoJSON sources with fill, line, `fill-pattern`, and symbol layers. Recompute only the changed component so edits stay instant.
- Map snapshot capture for reports.

---

## 12. Visuals (part of the Estimate & visualize step)

- **2D plan, 3D map, and 3D site** views are described in sections 10.3 and 11; they share selection and cost inspection.
- **Road cross-section** (SVG, one per road component, opens when a road is selected): lanes, parking, curbs, boulevards, sidewalks, cycling lanes, and below-grade watermain/sewers at their depths, with dimensions. Clicking an element highlights its line items and cost.
- **3D site scene** (three.js via React Three Fiber): one scene showing **all drawn components together** in their real relative positions (projected from map coordinates to local metres), procedurally generated from component data. Click any element to see its cost; selecting a component in the list focuses the camera on it. Option to isolate one component.
  - Building: every section extruded from its actual footprint (holes supported) to its own height, with floor lines, generated roofs, glazing bands, parking area, landscaping; components clickable (structure, envelope, interiors, MEP, site work) showing their cost share.
  - Park: ground from the drawn shape, procedurally scattered trees, and simple 3D forms generated from each feature's drawn shape (playground, splash pad, field, trail, washroom), clickable.
  - Road: a segment extrusion with pavement layers and buried pipes, clickable.
  - Toggle "colour by cost" (heatmap of component cost).
- Keep geometry simple and performant on laptops and phones, even with 10–20 components.

---

## 13. Scenarios & what-ifs

- Baseline plus unlimited scenarios; duplicate from any scenario.
- What-if controls: start date shift (months), price shocks per category (−20% to +40%), per-component parameter and geometry changes (e.g. staged vs full closure, pipe material, park features, storeys, quality level), and **adding or removing whole components** (e.g. "without the fire station", "add a second park").
- Comparison view: up to 3 scenarios side by side: P10/P50/P90, contingency, class, top drivers, and difference tables by component and by category.

---

## 14. Exports

- **PDF council report** (English): cover with project name, municipality, date, map snapshot; executive summary (AI narrative); estimate range and class; list of components with a map of each; cost breakdown by component and by category; risk and contingency; drivers; flags and required approvals; scenarios comparison (if any); assumptions and parameter sources; data sources and sample-data disclaimer.
- **Excel workbook**: sheets for Summary, Line Items (with sources), Assumptions, Scenarios.
- **Project file**: download the full project as a `.pwcost.json` file (see section 15).

---

## 15. No saved projects (session-only)

Projects are **not persisted**. There is no database, no browser storage of projects, and no share links.

- The current project lives in memory (Zustand) for the browser session. Refreshing or closing the tab loses it, so show a `beforeunload` confirmation when there are unsaved changes.
- **Download project file:** exports the full `Project` as a JSON file (`<name>.pwcost.json`). **Open project file:** loads one back, validated with zod (show a clear error if invalid or from an incompatible `schemaVersion`). This is the only way to keep work; it's user-controlled and needs no server.
- Uploaded PDFs are sent directly to the server route that processes them and are never stored; only the extracted results stay in the project.
- Demo projects are static JSON files bundled with the app and load straight into the workspace.

---

## 16. Demo projects (for the pitch)

Ship three complete, preloaded demo projects in an Ontario mid-sized city, each with drawn geometry, answered parameters, site context snapshot, cached AI outputs, and one extra scenario:

1. **"Maple Street renewal"** — ~800 m road reconstruction with new watermain, storm sewer, curbs, and sidewalks both sides, plus a culvert replacement where the street crosses a creek. Scenario: one-year delay.
2. **"Riverside park and pavilion"** — ~2 ha park with playground, splash pad, trail loop, and sports field, plus a small community pavilion building and a parking lot. Scenario: swap the splash pad for a second field.
3. **"Northgate neighbourhood hub"** (the headline combined demo) — two new local streets with watermains and sewers, a 1.5 ha park, a two-storey library, a fire station, and a culvert. Scenario: phase the fire station a year later and remove it from the first budget.

Opening a demo loads a fresh copy into the workspace; the bundled file is never modified.

---

## 17. Internationalization

- **English only.** French is dropped: no French translations, reports, AI output, or language toggle.
- All UI strings still go in `messages/en.json` via next-intl (no hard-coded UI text). New keys don't need to be added to `messages/fr.json`.
- The existing French plumbing stays as-is and unused: `/fr` routing, `fr.json`, and the `{ en, fr }` text type in schemas and the engine. Don't spend time on it; new engine text may copy the English into `fr`.
- Number and currency formatting via `Intl` for `en-CA`.

---

## 18. Design direction

- Serious civic tool, not a flashy startup page: calm, precise, trustworthy. The map is the hero.
- Typeface: **Public Sans** (Google Fonts) for UI, with tabular numerals for all figures; fallback system sans-serif.
- Palette: light neutral surfaces, deep slate text, one strong accent (construction/safety orange) used sparingly for primary actions and the P50 marker; blue for water utilities, green for parks, grey for pavement on map and visuals. Support dark mode.
- Numbers are the product: large, clear range display; consistent CAD formatting; units always shown.
- Accessibility: keyboard-usable controls and drawing tool buttons, visible focus, sufficient contrast, reduced-motion respected, labels on all inputs.
- Responsive down to mobile (map above panel sheet).

---

## 19. Non-functional requirements

- **Performance:** estimate recalculation (including Monte Carlo) under ~300 ms on a laptop; use a Web Worker if needed. Map interactions stay smooth.
- **Resilience:** all external calls (AI, OSRM, Overpass, geocoding) have timeouts, caching where sensible, user-friendly error states, and fallbacks. The app never shows a blank screen on failure.
- **Security:** API keys only on the server; validate every request body with zod; rate-limit AI and geo routes; uploaded files processed in memory and never stored; size- and type-limited (PDF ≤ 20 MB; CSV/XLSX ≤ 5 MB).
- **Code quality:** strict TypeScript, no `any` in engine code, small focused modules, engine fully unit-tested, lint + format configured.
- **Observability:** simple server logging of AI/geo failures; no third-party analytics needed.

---

## 20. Environment variables

```
# AI provider: gemini | anthropic | none
AI_PROVIDER=gemini

# Gemini (Google AI Studio free tier). Use current free-tier Flash / Flash-Lite model names from Google's docs.
GEMINI_API_KEY=
GEMINI_MODEL=            # e.g. a current Flash model
GEMINI_MODEL_FAST=       # e.g. a current Flash-Lite model

# Anthropic (optional, for later)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
ANTHROPIC_MODEL_FAST=claude-haiku-4-5-20251001

NEXT_PUBLIC_MAPTILER_KEY=
OSRM_URL=https://router.project-osrm.org
OVERPASS_URL=https://overpass-api.de/api/interpreter
IMAGE_PROVIDER=           # optional
IMAGE_API_KEY=            # optional
```

Provide `.env.example`. The app must start and be fully usable (with fallbacks) even when `AI_PROVIDER=none` or any optional key is missing.

---

## 21. Deployment

- GitHub repo → Vercel project (auto-deploy on push; preview deployments for branches).
- Set env vars in Vercel.
- Write a short `DEPLOY.md` with exact steps.
- Deploy early (end of Phase 0) and keep the deployment working after every phase.

---

## 22. Build phases

Complete one phase at a time. Each phase is broken into numbered tasks in `PROGRESS.md`; follow the protocol in `CLAUDE.md` (update progress after every task, commit per task, stop at the end of each phase for review).

**Phase 0 — Foundation.** Scaffold Next.js + TypeScript + Tailwind + shadcn/ui + next-intl (EN/FR routing) + Zustand + zod + Vitest. Design tokens and layout shell. `.env.example`, `README.md`, `PROGRESS.md`, `DEPLOY.md`. Deploy a placeholder to Vercel.
*Done when:* the app runs locally and on Vercel.

**Phase 1 — Map, drawing & live measurements.** Workspace page with MapLibre, geocoding search, project store holding **multiple components**, component list with planned/drawn status, freeform drawing tools for every component (polygon, rectangle, circle, freehand, line, point), multi-section buildings with per-section storeys, custom elements, smart-start shapes and a procedural starting layout generated from the build list, unrestricted editing (rotate, scale, vertices, holes, split/merge sections), procedurally generated 2D plan rendering (roofs from actual shapes, scattered trees, fitted field markings, true-width roads with markings), select/edit/duplicate/delete/undo across components, cross-component warnings, live measurement labels and panel, units toggle, road snapping with fallback, extrusion of all buildings on map.
*Done when:* a user can design any shapes and combinations (including multi-section buildings and custom elements), or generate a starting layout and edit it freely, with a recognizable 2D plan and correct live measurements (unit tests for measurement and generation helpers).

**Phase 2 — Data & cost engine.** Zod schemas, all seed data files, public data scripts and committed outputs (StatCan BCPI, CanadaBuys awards; section 8.1), four component types with parameter catalogs and quantity derivation, multi-component roll-up with per-component results, project-level mobilization, pricing, regional factors, BCPI-based escalation, winter logic, soft costs, taxes, estimate class, Monte Carlo, overrun reference, contingency, drivers, flags, overrides. Thorough Vitest tests.
*Done when:* the engine produces a complete combined and per-component `Estimate` for each demo-style project (including several components of the same type), tests pass, and results are deterministic with a seed.

**Phase 3 — Estimate & visualize workspace.** View switcher (2D plan / 3D map; 3D site added in Phase 9) with shared selection and hover/click cost inspection, scope selector (whole project / single component); Estimate, Line items, and Inputs tabs wired to the engine with live recalculation from map edits; per-component breakdown; range display, class badge with improvement hints, contingency, overrun risk, distribution chart, category breakdown, drivers tornado, flags, sources, overrides with reset, sample-data badge.
*Done when:* drawing or editing geometry and changing inputs visibly updates the estimate within ~300 ms.

**Phase 4 — Project files, demo projects & landing.** Download/open project file with validation, unsaved-changes warning, three bundled demo projects, landing page.
*Done when:* a project can be downloaded and reopened exactly, and each demo loads into the workspace.

**Phase 5 — Reports & exports.** PDF council report (with map snapshot, template-based narrative for now), Excel workbook (English).
*Done when:* all exports download correctly for each demo project in both languages.

**Phase 6 — Site context & flags.** Overpass-based lookups (schools, hospitals, waterways, rail, existing road attributes where tagged), caching and fallback, automatic background lookup, allowances and flags integrated into the engine and reports.

**Phase 7 — AI features.** Whole-build prompt parsing into a build list + build list review screen, drawing planned components from the build list, smart follow-up questions, document upload + extraction review, AI narrative in reports (with number check), all fallbacks, rate limiting, cached AI outputs for demos.
*Done when:* the full describe → review build list → locate → draw each component → questions → estimate flow works with `AI_PROVIDER=gemini` and `AI_PROVIDER=none`.

**Phase 8 — Scenarios.** Scenario creation, what-if controls including adding/removing components, comparison view; scenarios reflected in exports.

**Phase 9 — 3D site scene & cross-sections.** Road cross-sections per road component, one 3D site scene with all components in position (added to the view switcher), clickable elements and cost heatmap, optional concept image provider.

**Phase 10 — Polish & pitch readiness.** Accessibility pass, mobile layout, empty/error states, performance check, `/data` page, demo walkthrough rehearsal (section 23), final deploy.

---

## 23. Demo walkthrough (the app must support this smoothly)

1. On the landing page, type: "A new neighbourhood hub in the north end: two new local streets with watermains and sewers, a park with a playground and splash pad, a two-storey library, and a fire station, starting spring 2027."
2. Review the build list: five components detected; rename one, add a culvert.
3. Search the city, outline the project area, and click **Generate starting layout**: streets, library, fire station, and park appear, sized from the prompt. Then design freely: reshape the park into a curved shape, add a custom "skate park", split the library into a 1-storey wing and a 3-storey section, and rotate the fire station. The 2D plan looks like a real site plan, and measurements and the running total update with every change.
4. Answer the smart questions (asked across the project, biggest costs first); upload a sample geotechnical PDF and apply its soil findings to all road components.
5. Show the combined range, the per-component breakdown, overrun risk, contingency, drivers, and flags (e.g. the culvert's creek permit, a school near a street).
6. In Estimate & visualize, switch between 2D plan, 3D map, and 3D site; click the library to see its cost; select a street to show its cross-section; turn on colour by cost.
7. Create a scenario that removes the fire station and compare.
8. Export the council report (PDF) and the Excel workbook.
9. Open the "Maple Street renewal" demo to show a simpler single-street project.

---

## 24. Out of scope for now

Saved projects / database / share links, user accounts and permissions, real (licensed) pricing data, funding program planning/matching (future roadmap item), tender/bid analysis, automated scraping of tender sites, detailed design drawings, building code compliance review, zoning outside the three cities in section 8.3, full BIM/IFC import, payments, admin dashboards, multi-user real-time editing.

---

## 25. Change log

One line per change to this spec: `YYYY-MM-DD P#.#: what changed and why`. Newest at the bottom.

- 2026-09-25 (pre-build): Projects are now combinations of any number of roads, parks, buildings, and structures; flow is prompt for the whole build → build list → draw each component on the map → questions → estimate.
- 2026-09-25 (pre-build): Removed tender analysis and final-cost recording (section and Phase 10); later sections and phases renumbered.
- 2026-09-25 (pre-build): Removed funding planning (section and tasks); later sections renumbered. Funding program matching kept as a future roadmap item.
- 2026-09-25 (pre-build): Merged estimate and visuals into one "Estimate & visualize" step with a linked view switcher (2D plan / 3D map / 3D site). Added a tile palette of real-size buildings, park features, and structures with recognizable 2D plan rendering; added housing building subtypes; added `tiles.json`.
- 2026-09-25 (pre-build): Replaced the fixed tile palette with unlimited freeform design (any shape, multi-section buildings with per-section heights, custom elements priced by match or own rate), procedurally generated smart-start shapes and starting layouts, and procedurally generated 2D/3D rendering from actual shapes. `tiles.json` replaced by `typologies.json`.
- 2026-09-25 (pre-build): Added real public data: Statistics Canada BCPI (table 18-10-0289-01) for escalation and price trends, and CanadaBuys award notices as market evidence, both via build-time scripts into committed JSON; added the Market evidence card (sections 7.1, 8.1, 8.2).
- 2026-09-26 P2.1 [B]: `ProjectMeasurements` is now `{ components: Record<componentId, Measurements>, totals }` (the old intersection type can't be typed cleanly); `Measurements.sections` adds per-section footprint/perimeter/GFA for shape complexity.
- 2026-09-26 P2.1 [B]: `LineItem` gets `elementRef?: { sectionId?, featureId? }` (clickable visuals, TEAM.md 3.1), `componentId: null` for project-level items like mobilization, and `lowConfidence` for custom elements.
- 2026-09-26 P2.1 [B]: Custom pricing (6.5) is stored as `customPricing` on custom `Component`s and custom `PlacedFeature`s: `{ mode: 'matched', basisId, unit }` or `{ mode: 'own_rate', unit, rate, low?, high? }`.
- 2026-09-26 P2.1 [B]: Engine-produced text (line item descriptions and sources, flags, drivers, hints) is `{ en, fr }` so the pure engine stays locale-free and exports can pick a language. Flags also get a stable `code` and optional map `location`; component estimates carry `improvementHints`; `Estimate` adds `escalationDetail` (BCPI factor, proxy label, rate source) and `seed`.
- 2026-09-26 P2.1 [B]: `SiteContext` defined as `{ source: 'overpass' | 'demo_snapshot' | 'unavailable', fetchedAt, features: { id, kind: school | hospital | waterway | rail | road | floodplain, name?, geometry, tags? }[] }`.
- 2026-09-26 P1.3 [A]: Components (including their params, paramMeta, overrides) live in the design store slice so geometry and parameter edits share one undo/redo history; project meta, settings, and scenarios stay in the project slice. Duplicates are offset 25 m east and south.
- 2026-09-26 P0.5 [B]: API route conventions in `src/lib/api`: `jsonRoute` wrapper (rate limit → zod body validation → handler), error body `{ error: { code, message, issues?, retryAfterSeconds? } }` with stable codes the UI translates, 422 for validation failures, 429 with `Retry-After`; in-memory per-IP fixed-window limits per route family (ai, geo, export), per server instance.
- 2026-09-26 Z [B]: Added real zoning limits for Waterloo, Toronto, Ottawa, Vancouver (new section 8.3): zone maps from city open data (runtime query with cache/fallback, or script-built JSON), hand-transcribed limits with by-law citations, engine checks produce advisory flags only (never block, never change the estimate). `Project` gets `zoningContext`. Needs a zoning map layer from A (see PERSON_B.md requests). Building code review stays out of scope.
- 2026-09-26 Z [B]: Dropped Vancouver from zoning (section 8.3); zoning covers Waterloo, Toronto, Ottawa, all in Ontario like the rest of the pricing.
- 2026-09-26 P1.5 [A]: Drawing tools per type: roads use line or freehand line; parks, buildings, building sections and the project area use polygon, rectangle, circle, ellipse or freehand (smoothed); structures use a point or a line (span); custom elements and park features may use any tool. Self-crossing polygons are rejected. A building's first shape is both its site and its first section (1 storey, flat roof) until a separate site is drawn. Line curve smoothing is not implemented.
- 2026-09-26 P2.5 [B]: BCPI file keeps Ontario CMAs published in the table (Toronto, Ottawa part, London) plus the 15-CMA composite, 12 building types, and 6 divisions (composite, concrete, structural steel, earthwork, exterior improvements, utilities) for the last 24 quarters. The civil divisions are available as closer labelled proxies for roads/parks/structures than the non-residential composite. `referenceCma` values are the file's geography keys (`toronto`, `ottawa`, `london`); London is the reference for southwestern Ontario.
- 2026-09-26 P1.7/P1.8 [A]: Editing: drag moves the grabbed shape (a site or park carries its sections and features); handles move, rotate and scale the whole component; holes go into the selected polygon (feature or section, else the first section or primary). Sections: storeys stepper, roof, delete, and merge (union, tallest section's storeys and roof win). Splitting a section by a line is deferred (MVP).
- 2026-09-26 P3.5 [B]: Scope selector is the shared selection (`selectedComponentId`), not separate state; plain dropdown, single component or whole project only. Tabs read scoped figures via `scopeEstimate()` in `src/lib/estimate/scope.ts`.
- 2026-09-26 P1.9/P1.10 [A]: Smart start and layout generation size shapes from component params `gfaOverrideM2` (or `gfaM2`), `storeys`, `areaM2`, `lengthM` when present (e.g. set by the prompt parser), else from `typologies.json`. Generated buildings get a site = footprint + typical setback. Layout: roads as a street grid through the centre (project-area centre or map centre), buildings fronting streets, then parks; Regenerate re-places only components still 'generated'.
- 2026-09-26 P7.2 [B]: `ProjectDraft` / `BuildListItem` / `ParseResponse` schemas in `src/lib/schemas/draft.ts`. Build list params may also carry layout size hints (`storeys`, `areaM2`, `lengthM`) that aren't engine params; geometry replaces them once drawn. Counts are expanded into separate named items (max 20 each). Gemini is called via REST (no SDK dependency).
- 2026-09-26 P7.2 [B]: Parse uses the fast Gemini model (Flash-Lite; the thinking Flash model was >20 s). Park amenities in the prompt come back as `features` (park feature kinds) on the park build-list item, not as separate components; today's date is sent so relative start dates resolve.
- 2026-09-26 i18n [B, per the human]: French dropped; the app is English only (section 17). No French strings, translations, reports, AI output, or language toggle. Existing `fr` plumbing (routing, `fr.json`, `{ en, fr }` text) stays but is unused; nothing is ripped out. P10.1 dropped.
- 2026-09-26 Data [B, per the human]: Building base rates replaced with real Altus Group 2026 Canadian Cost Guide benchmarks (GTA/Ottawa average, $/sq ft → $/m²); each subtype carries its source, and building BCPI escalation starts from that file's own price year (2026). Everything else remains sample data; the sample-data badge stays.
- 2026-09-26 B.3 [B, per the human]: Seven more building subtypes from the Altus 2026 rows (ice arena, aquatic centre, secondary school, performing arts, museum/gallery, medical clinic, maintenance facility) with typologies. Custom elements can be matched to any building rate (`building:<subtype>` basis ids), park features, or unit prices, with a keyword suggestion from the name; the pricing form lives in the Inputs tab (custom components and custom park features).
- 2026-09-26 P3.7/P3.8 [B, per the human]: Market evidence card leads with a benchmark check against Altus 2026 (building $/sq ft, road $/m); CanadaBuys list trimmed to 3 recent awards; local tenders skipped (no data). Charts are plain HTML/CSS bars (no chart library).
- 2026-09-26 P6.3 [A, per the human]: Site context is looked up automatically when the design's location changes (debounced, ~100 m key; a failed lookup keeps the previous result; a loaded project keeps its snapshot until it moves). No button, no map overlays. The engine (`src/engine/site.ts`) turns it into sourced allowance line items and flags: school/hospital within 200 m (+2% / +1.5% of direct, traffic control), waterway within 30 m (+2% + $15k conservation authority permit, high), 30–100 m (info), rail within 30 m ($25k proximity agreement). Allowances are sample engine rules.
- 2026-09-26 P6.3/P7.5 [B]: (Site flags and allowances are A's `src/engine/site.ts`, see the P6.3 [A] line.) Roads auto-fill lanes/class/sidewalks from OSM tags of the street they follow (source "From site", defaults only). Questions: the AI picks up to 8 from the ranked candidates (cost impact × share) and writes the reason; it answers with candidate ids, so it can't invent params. Params the drawing answers (GFA override, sizes) and building special spaces that don't fit the subtype are never asked; "apply to all" groups roads/parks/structures by type and buildings by subtype. Questions live in a panel tab.
- 2026-09-26 P7.4 [A, per the human]: P7.8 (cached AI outputs for demo projects) dropped; demos use live AI with the deterministic fallbacks. Creation flow: after the build-list review, placing the last planned component switches the estimate panel to the Questions tab once (Describe → Review → Place → Questions → Estimate).
- 2026-09-26 UI [A, per the human]: Defaults are the answer: the Estimate tab no longer lists "To improve accuracy, answer" hints (the engine still computes `improvementHints`), and the Inputs tab has no "Use default" buttons (users just change a value). Building amenities in the prompt (pool, gym, rink, kitchen, basement/underground parking, parking stalls, bays, elevators) are set as params on that building by the AI prompt and the keyword fallback.
- 2026-09-26 Z [B, per the human: MVP]: Zoning scoped down to a live zone lookup (Ottawa + Cambridge public ArcGIS services; Waterloo/Kitchener have none) with advisory zone, site-specific and use-mismatch flags; no hand-transcribed limits. `Project.zoningContext` = zone per building id. See the note at the top of 8.3.
- 2026-09-26 Z [B, per the human]: Waterloo added to the zoning lookup (By-law 2018-050) via the map service behind the city's public viewer.
- 2026-09-26 Engine [A, per the human]: Anything the user or prompt doesn't specify uses its default and is priced. Building amenities (gymnasium, pool, rink, kitchen, sally port, council chamber) now default to off for every subtype (were on for community centre, schools, police, municipal office); sizing defaults (parking stalls, apparatus bays) stay per subtype.
- 2026-09-26 Engine [A, per the human]: Estimate class completeness (section 7.x) counts on/off inputs as always answered (off means the item isn't there), so toggling a switch never changes the class; only non-boolean high-impact inputs (sizes, soil, scope, quality…) count once someone sets them.
- 2026-09-26 Z [B, per the human]: Whole Waterloo zone map imported as a committed snapshot (`scripts/fetch-waterloo-zoning.ts`, `pnpm data:zoning`, 2,918 zones, 1.2 MB, server-side only); Waterloo lookups no longer call the city at runtime. `/api/zoning/map` returns zone polygons in a box for an optional map layer.
- 2026-09-26 Types [A, per the human]: New component type `parking` (subtype `surface_lot`, drawn as an area): priced from area/perimeter (asphalt or permeable surface, grading, markings from stalls = entered or area/30 m², catch basins, OGS from 2,000 m², curbs on by default; lighting and EV chargers off unless specified; stormwater flag from 5,000 m²). Buildings no longer include surface parking by default (all subtype `parkingStalls` defaults removed; the param and drawn parking areas on a building site still work). Prompt: "a parking lot / parking for N cars" → a parking component with stalls; underground parking → building basement. Overrun uses the road reference.
- 2026-09-26 Z [A]: Zoning map layer: a "Zoning" toggle (under the view switcher, 2D/3D map) draws Waterloo zones from `/api/zoning/map` for the visible area (≤ ~5 km, reloads on move), coloured in 7 groups (residential, mixed use, commercial, employment, open space, institutional, other), under the design; clicking a zone shows its code, name and family in the legend, with source and limits.
- 2026-09-26 UI [A, per the human]: "Things to check" (flags) is a collapsed, scrollable box; flags are read-only (clicking no longer scopes the panel, since it looked actionable but did nothing useful).
- 2026-09-26 UI [A, per the human]: Removed the drivers tornado ("What moves the total most") from the Estimate tab (the engine still computes drivers for reports); Market evidence is a collapsible card, closed by default.
