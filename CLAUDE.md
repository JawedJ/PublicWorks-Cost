# CLAUDE.md

Project: **PublicWorks Cost** — map-based, AI-assisted cost estimating for Canadian public infrastructure.

## Project memory files

Context is reset often. These two files are the project's memory; keep them accurate.

| File | Purpose | How to update |
| --- | --- | --- |
| `SPEC.md` | What to build. | Edit it when a decision changes or clarifies the spec, and add a one-line entry to its **Change log** (section 25). Never make large rewrites without the human's approval. |
| `PROGRESS.md` | Where we are: current state, handoff notes, phase checklists, feature map, known issues. | Update after **every** completed task. |

Git history (one commit per task) is the record of what was done.

## Session start protocol (do this first, every session)

1. Read `PROGRESS.md` fully, including "Handoff notes".
2. Read the `SPEC.md` sections relevant to the current phase, plus its Change log (don't reread the whole spec each session).
3. Run `git status` and `git log --oneline -10` to confirm the code matches `PROGRESS.md`. If they disagree, trust the code, fix `PROGRESS.md`, and mention it.
4. State in one or two lines: current task, what you'll do next. Then start.

## During work

- Work on **one task id at a time** (e.g. `P1.4`). Mark it `[~]` in `PROGRESS.md` when starting.
- When a task is done: verify it (run it / test it), mark it `[x]`, update "Current state" and the **Feature map**, then commit.
- Commit after each task with the message format: `P1.4: short description`. Small, frequent commits.
- A choice that changes or clarifies the spec → edit `SPEC.md` in place and add a Change log line (`YYYY-MM-DD P1.4: what changed and why`).
- Bugs you can't fix now → "Known issues" in `PROGRESS.md`.
- Blocked (missing key, account, unclear requirement) → mark `[!]`, write the blocker in "Current state", and ask the human.
- Do not start the next **phase** without the human's go-ahead. Continuing to the next **task** within a phase is fine.

## Session end protocol (before stopping or when context is getting long)

1. Make sure the app builds; run `pnpm typecheck`, `pnpm lint`, `pnpm test` (at least for touched areas).
2. Commit all work (WIP commits are fine: `P1.5: WIP boundary drawing`).
3. Update `PROGRESS.md` "Current state" and "Handoff notes" so a fresh session knows exactly what to do next. For an unfinished task, say precisely where it stopped (file, function, what's left).
4. Reply with a 3–5 line summary.

## End of phase

Run typecheck, lint, and all tests; fix failures; confirm the phase's "Done when" criteria; set status to "phase complete, awaiting review"; summarize and stop.

## General

- Check current official docs for library APIs (Next.js, MapLibre, Terra Draw, Google GenAI SDK, Anthropic SDK, next-intl) instead of relying on memory.
- If the spec is ambiguous, choose the simplest reasonable option, update `SPEC.md`, and log it in the Change log.
- Keep the app runnable and deployable after every task.

## Non-negotiable rules

- **AI interprets, code calculates.** Never let an AI response produce or alter cost numbers. All costs come from `src/engine`.
- The engine in `src/engine` is pure TypeScript: no React, no fetch, no `Math.random` (use the injected seeded RNG). It must be fully unit-tested.
- Every line item carries a `quantitySource` and `unitPriceSource`.
- All AI calls go through the provider interface in `src/lib/ai` (never import a vendor SDK in feature code). AI output is validated with zod against catalog parameter ids; every AI feature has a deterministic fallback, including when rate-limited (HTTP 429).
- API keys are server-only. Never import them into client components.
- No database, no persistence of projects, no share links. Projects live in memory; the only way to keep work is the downloadable project file (SPEC section 15). Don't add storage without the human's approval.
- Validate every API route body with zod. Rate-limit AI and geo routes.
- All user-facing strings go through next-intl (`messages/en.json`). No hard-coded UI text. English only: French is dropped (SPEC 17), don't add to `messages/fr.json`.
- Metric units first, CAD currency, `en-CA` formatting via `Intl`.
- Seed data is sample data: keep the sample-data disclaimers visible (the top-bar badge was removed per the human).
- Public data (StatCan BCPI, CanadaBuys) is fetched only by the scripts in `scripts/` and committed as JSON; never call these services at runtime. CanadaBuys records are evidence only and never feed the cost engine. Always show source, date, and limits.

## Conventions

- pnpm, TypeScript strict, no `any` in engine code.
- Shared schemas in `src/lib/schemas`; infer types with `z.infer`.
- Components small and focused; client components only where interactivity requires it.
- Tailwind + shadcn/ui; Public Sans with tabular numerals for figures.
- Name things by what users understand (e.g. "Download project file", not "serialize state").

## Next.js version note

@AGENTS.md
