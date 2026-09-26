# TEAM.md — Two-person build

Two people build PublicWorks Cost at the same time in one GitHub repo, each with their own Claude Code session. This file is the shared rulebook. Each person also has their own file:

- **Person A — Map, design & visuals** → `PERSON_A.md`
- **Person B — Engine, data, AI & outputs** → `PERSON_B.md`

`SPEC.md` is still what to build, and `CLAUDE.md` still applies, **except where this file overrides it** (section 6).

---

## 1. How to start a session (both people)

Tell Claude Code: *"We're in team mode. Read TEAM.md and PERSON_A.md (or PERSON_B.md), then follow the session start protocol."*

The agent then:
1. Runs `git pull` on `main` (and rebases its current branch if it has one).
2. Reads `TEAM.md`, its own `PERSON_X.md` (Current state, Handoff notes, task list), and `CLAUDE.md`.
3. Reads only the `SPEC.md` sections for its next tasks, plus the SPEC Change log.
4. States the next task id and starts.

---

## 2. Who owns what

Each person edits **only their own folders**. That's what keeps two people from colliding.

| Area | Person A | Person B |
| --- | --- | --- |
| App shell | scaffold, layout, design tokens, top bar, landing page, workspace page layout | the panels mounted into the layout |
| Map & design | `src/components/map/**`, `src/lib/geo/**`, `src/lib/render/**` (procedural 2D rendering), `src/app/api/geo/**`, `public/icons/**` | — |
| Visuals | `src/components/visuals/**` (3D map, 3D site, cross-sections) | — |
| Schemas | reads | **owns** `src/lib/schemas/**` |
| Engine & data | `src/data/typologies.json` only (sizes and styles for generation and rendering) | `src/engine/**`, `src/data/**` (except `typologies.json`), `scripts/**` |
| Estimate UI | colour-by-cost and cost tooltips on the views | `src/components/estimate/**` (all tabs, market evidence card) |
| AI | — | `src/lib/ai/**`, `src/app/api/ai/**`, `src/components/questions/**` |
| Scenarios & exports | map snapshot helper | `src/components/scenarios/**`, `src/components/reports/**`, `src/lib/export/**`, `src/lib/project-file/**`, `src/app/api/export/**` |

**Shared files** (edit rarely, in small separate commits, always pull first):
- `package.json` / `pnpm-lock.yaml` — add dependencies in their own commit. On a lockfile conflict: take `main`'s version, run `pnpm install`, commit.
- `messages/en.json`, `messages/fr.json` — add keys only under your own top-level namespaces. A: `map`, `design`, `visuals`, `landing`, `layout`. B: `estimate`, `questions`, `scenarios`, `export`, `data`, `buildList`. Anyone may add (never rename) keys under `common`.
- `src/lib/store/store.ts` — only combines slices; A creates it, B adds its slice import (one line).
- `.env.example` — add lines only.

If you need a change in the other person's area, **don't make it**. Write it under "Requests to the other person" in your own `PERSON_X.md` and tell your teammate.

---

## 3. Contracts (agree and merge in the first hour)

These interfaces let both people build in parallel against the same shapes. Change them only by agreement, in one small commit, with a line in the SPEC Change log tagged `[A]` or `[B]`.

1. **Schemas** (B owns, `src/lib/schemas/`): `Project`, `Component`, `ComponentGeometry`, `BuildingSection`, `PlacedFeature`, `Measurements`, `ProjectMeasurements`, `Scenario`, `Estimate`, `LineItem`, `Flag`, as in SPEC section 5 and 7.
   - **Addition for clickable visuals:** `LineItem` gets optional `elementRef?: { sectionId?: string; featureId?: string }` so A can show the cost of a specific building section or park feature. B adds it and logs it in the SPEC Change log.
2. **Measurement API** (A owns, `src/lib/geo/measure.ts`):
   - `measureComponent(component: Component): Measurements`
   - `measureProject(project: Project): ProjectMeasurements`
   - B's engine imports these. Until they exist, B tests with fixture measurements.
3. **Engine API** (B owns, `src/engine/index.ts`):
   - `computeEstimate(project: Project, measurements: ProjectMeasurements, refData: RefData, opts: { seed: number }): Estimate`
4. **Store** (`src/lib/store/`), split into slices:
   - `designSlice.ts` (A): components' geometry, add/remove/duplicate components, selection, undo/redo, view mode, `colourByCost` toggle.
   - `projectSlice.ts` (B): project meta, component params and paramMeta, overrides, settings, scenarios, questions state.
   - `store.ts` (A creates, both import): combines slices.
   - **Selection contract** (in A's slice, read and set by both): `selectedComponentId: string | null` and `selectedElement: { componentId: string; sectionId?: string; featureId?: string } | null`.
5. **Estimate hook** (B owns, `src/lib/estimate/useEstimate.ts`): `useEstimate(): { estimate: Estimate | null; computing: boolean }`. Debounced; recomputes when the store changes.
6. **Fixtures** (B commits in hour 1–2, `src/lib/fixtures/`): `northgate.project.json` (valid `Project` with geometry for all Northgate components) and `northgate.estimate.json` (valid `Estimate`, hand-written is fine). A builds colour-by-cost, tooltips, and 3D against these before the engine is live.

---

## 4. Git workflow

- `main` must **always run and deploy** (Vercel deploys `main`).
- Work on short branches named `a/P1.5-draw-tools` or `b/P2.8-road-type`. Merge to `main` as soon as a task (or a small group) works — aim for **every 1–2 hours**, not once at the end.
- Before merging: `git pull --rebase origin main`, then `pnpm typecheck && pnpm lint && pnpm test`. Only merge when green.
- Commit messages: `P1.5 [A]: freeform polygon tool`. One task per commit where possible.
- Never force-push `main`. Never commit `.env.local` or any key — **the repo must be public for submission.**
- Submission rule: **everything merged into `main`** by the deadline.

---

## 5. Sync points (hours after the 12:00 kickoff)

Stop at each sync point, merge to `main`, pull, and check the app together for 5–10 minutes.

| When | Person A has merged | Person B has merged | Together |
| --- | --- | --- | --- |
| **S1 · +1h (1 PM)** | scaffold, layout shell, store with empty slices, first Vercel deploy | schemas, fixtures, seed data skeleton | confirm contracts in section 3 |
| **S2 · +5h (5 PM)** | map, draw roads/parks/buildings, live measurements, component list | engine producing a full estimate from the fixture; public data scripts run | wire `useEstimate` to the live store: drawing changes the estimate |
| **S3 · +10h (10 PM)** | 2D procedural rendering, generate layout, colour by cost, cost tooltips | estimate panel tabs, market evidence card, AI parse → build list, project files | full flow: prompt → build list → design → estimate |
| **S4 · +16h (4 AM)** | 3D map extrusion; 3D site and cross-sections if time | questions, exports (PDF/Excel), demo projects' params | **feature freeze** — bugs and polish only after this |
| **S5 · +20h (8 AM)** | mobile/accessibility pass, final deploy | French strings, error states, `/data` page | rehearse demo (SPEC section 23), record ≤5-min video by 11 AM, submit by 12 PM |

If you're behind at a sync point, drop **Stretch** tasks first (marked in each person's file), never Core ones.

---

## 6. Overrides to CLAUDE.md in team mode

- **Progress:** track progress only in your own `PERSON_X.md` (tick tasks, Current state, Handoff notes, your Feature map rows). **Do not edit `PROGRESS.md`** or the other person's file during the build. `PROGRESS.md` stays the master task list; task ids are shared.
- **Phases:** don't stop at the end of each SPEC phase. Work through your own task list in order and stop at the **sync points** above (and whenever blocked).
- **Spec changes:** allowed only for your own areas or agreed contracts; add a Change log line tagged `[A]` or `[B]`.
- **Ownership:** never edit the other person's folders (section 2). Use "Requests to the other person".
- Everything else in `CLAUDE.md` still applies: AI never produces costs, keys are server-only, no database, public data only via scripts, i18n for all strings, commit after each task, session end protocol (but write state into your own `PERSON_X.md`).

---

## 7. Keys and accounts

Share keys privately (not in the repo, not in chat logs you'll publish): Gemini API key and MapTiler key. Each person puts them in their own `.env.local`. Person A adds them to Vercel once.
